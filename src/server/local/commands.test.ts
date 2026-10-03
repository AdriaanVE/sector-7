import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalCommandManager, CommandResult } from './commands';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function done(manager: LocalCommandManager, result: CommandResult) {
  for (let count = 0; count < 200; count++) {
    const current = await manager.poll('chat', result.invocationId, result.jobId);
    if (current.status !== 'running') return current;
    await sleep(20);
  }
  throw new Error('Command did not terminate.');
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'sector7-command-'));
  return { root, manager: new LocalCommandManager(join(root, 'receipts')) };
}

test('commands use selected cwd, label UTF-8 stdout/stderr, keep receipts and reject changed invocation', async () => {
  const { root, manager } = await fixture();
  try {
    const request = { scope: 'chat', invocationId: 'one', root, command: "pwd; printf 'héllo'; printf 'error' >&2" };
    const started = await manager.start(request);
    assert.equal((await manager.start(request)).jobId, started.jobId);
    const result = await done(manager, started);
    assert.equal(result.status, 'succeeded');
    assert.ok(result.chunks.some(chunk => chunk.stream === 'stdout' && chunk.text.includes('héllo')));
    assert.ok(result.chunks.some(chunk => chunk.stream === 'stdout' && chunk.text.includes(root)));
    assert.ok(result.chunks.some(chunk => chunk.stream === 'stderr' && chunk.text.includes('error')));
    assert.deepEqual((await manager.poll('chat', 'one', started.jobId, result.cursor)).chunks, []);
    await assert.rejects(manager.start({ ...request, command: 'false' }), /different arguments/);
    await assert.rejects(manager.poll('other-chat', 'one', started.jobId), /not part/);
    await assert.rejects(manager.poll('chat', 'other-invocation', started.jobId), /not part/);
    await assert.rejects(manager.poll('chat', 'one', started.jobId, 99999), /ahead/);
    await sleep(50);
    const restarted = new LocalCommandManager(join(root, 'receipts'));
    assert.equal((await restarted.start(request)).status, 'succeeded');
    const differentRoot = await manager.start({ ...request, invocationId: 'different-root', root: tmpdir(), command: 'pwd' });
    assert.equal((await done(manager, differentRoot)).chunks.map(chunk => chunk.text).join('').trim(), await realpath(tmpdir()));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('cancel kills the command process group, timeout terminates and concurrency is bounded', async () => {
  const { root, manager } = await fixture();
  try {
    const marker = join(root, 'child-survived');
    const one = await manager.start({ scope: 'chat', invocationId: 'one', root, command: `(sleep 1; printf survived > '${marker}') & wait` });
    const two = await manager.start({ scope: 'chat', invocationId: 'two', root, command: 'sleep 30', timeoutMs: 100 });
    await assert.rejects(manager.start({ scope: 'chat', invocationId: 'three', root, command: 'true' }), /Two local/);
    await manager.cancel('chat', 'one', one.jobId);
    assert.equal((await done(manager, one)).status, 'cancelled');
    assert.equal((await done(manager, two)).status, 'timed_out');
    assert.equal((await manager.cancel('chat', 'one', one.jobId)).status, 'cancelled');
    await sleep(1100);
    await assert.rejects(readFile(marker), { code: 'ENOENT' });
    const failed = await manager.start({ scope: 'chat', invocationId: 'failed', root, command: 'exit 7' });
    assert.equal((await done(manager, failed)).exitCode, 7);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('output is capped, UTF-8 is complete, and app inference keys are not inherited', async () => {
  const { root, manager } = await fixture();
  const before = process.env.BIFROST_API_KEY;
  process.env.BIFROST_API_KEY = 'test-not-a-real-key';
  try {
    const result = await done(manager, await manager.start({ scope: 'chat', invocationId: 'large', root, command: "while true; do printf 'éééééééééééééééééééééééééééééééé'; done" }));
    assert.equal(result.status, 'output_limit'); assert.equal(result.truncated, true);
    assert.ok(result.chunks.reduce((sum, chunk) => sum + Buffer.byteLength(chunk.text), 0) <= 256 * 1024);
    assert.ok(result.chunks.every(chunk => !chunk.text.includes('\ufffd')));
    const env = await done(manager, await manager.start({ scope: 'chat', invocationId: 'env', root, command: 'test -z "$BIFROST_API_KEY"' }));
    assert.equal(env.status, 'succeeded');
  } finally {
    if (before === undefined) delete process.env.BIFROST_API_KEY; else process.env.BIFROST_API_KEY = before;
    await rm(root, { recursive: true, force: true });
  }
});

test('interrupted durable reservations never replay, invalid timeout and roots are rejected', async () => {
  const { root, manager } = await fixture();
  try {
    const request = { scope: 'chat', invocationId: 'once', root, command: 'true' };
    const result = await done(manager, await manager.start(request)); await sleep(50);
    const path = join(root, 'receipts', `${result.jobId}.json`);
    const receipt = JSON.parse(await readFile(path, 'utf8')); receipt.status = 'running'; receipt.finishedAt = null;
    await writeFile(path, JSON.stringify(receipt));
    const restarted = new LocalCommandManager(join(root, 'receipts'));
    assert.equal((await restarted.start(request)).status, 'interrupted');
    const old = JSON.parse(await readFile(path, 'utf8')); old.startedAt = 0;
    await writeFile(path, JSON.stringify(old));
    const compacted = new LocalCommandManager(join(root, 'receipts'));
    await done(compacted, await compacted.start({ scope: 'chat', invocationId: 'trigger-prune', root, command: 'true' }));
    const retained = await compacted.start(request);
    assert.equal(retained.status, 'interrupted'); assert.equal(retained.outputExpired, true);
    await assert.rejects(manager.start({ ...request, invocationId: 'invalid', root: '.', timeoutMs: 300001 }));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('command route binds saved project/chat/folder invocation, rejects tampering and cancels an aborted start', async () => {
  const { POST } = await import('../../../app/api/local/commands/route');
  const { validateFolderPath } = await import('./folders');
  const { emptyWorkspace } = await import('~/common/personal/workspace-schema');
  const { commitWorkspace } = await import('./workspace');
  const root = await mkdtemp(join(tmpdir(), 'sector7-command-route-'));
  const previous = process.env.AI_GUI_DATA_DIR; process.env.AI_GUI_DATA_DIR = root;
  try {
    const folder = await validateFolderPath(root); const workspace = emptyWorkspace();
    const invocationId = 'route-call'; const command = 'sleep 30';
    workspace.stores['app-folders'] = { version: 1, state: { folders: [{ id: 'project', title: 'Project', conversationIds: ['chat'], instructions: '', fileIds: [], revision: 1, connectedFolders: [folder] }], enableFolders: true } };
    workspace.stores['app-chats'] = { version: 5, state: { conversations: [{ id: 'chat', messages: [{ id: 'message', role: 'assistant', tokenCount: 0, created: 0, updated: null, fragments: [{ ft: 'content', fId: 'fragment', part: { pt: 'tool_invocation', id: invocationId, invocation: { type: 'function_call', name: 'local_command', args: JSON.stringify({ folder_id: folder.id, command }) } } }] }], created: 0, updated: null, tokenCount: 0, systemPurposeId: '' }] } };
    await commitWorkspace(workspace, 0, root);
    const identity = { projectId: 'project', conversationId: 'chat', folderId: folder.id, invocationId };
    const request = (body: object, signal?: AbortSignal, origin = 'http://127.0.0.1:3004') => new Request('http://127.0.0.1:3004/api/local/commands', { method: 'POST', headers: { host: '127.0.0.1:3004', 'content-type': 'application/json', origin }, body: JSON.stringify(body), signal });
    assert.equal((await POST(request({ ...identity, action: 'start', command: 'false' }))).status, 409);
    assert.equal((await POST(request({ ...identity, conversationId: 'other', action: 'start', command }))).status, 403);
    assert.equal((await POST(request({ ...identity, action: 'start', command }, undefined, 'http://evil.example'))).status, 403);
    const aborted = new AbortController(); aborted.abort();
    const start = await POST(request({ ...identity, action: 'start', command }, aborted.signal));
    assert.equal(start.status, 200); const job = await start.json();
    let result;
    for (let count = 0; count < 100; count++) {
      result = await (await POST(request({ ...identity, action: 'poll', jobId: job.jobId }))).json();
      if (result.status !== 'running') break; await sleep(20);
    }
    assert.equal(result.status, 'cancelled');
  } finally {
    if (previous === undefined) delete process.env.AI_GUI_DATA_DIR; else process.env.AI_GUI_DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test('SIGTERM-resistant commands are force-killed within the cancellation grace', async () => {
  const { root, manager } = await fixture();
  try {
    const started = await manager.start({ scope: 'chat', invocationId: 'resistant', root, command: "trap '' TERM; printf ready; while true; do sleep 1; done" });
    for (let count = 0; count < 50; count++) {
      if ((await manager.poll('chat', 'resistant', started.jobId)).chunks.length) break;
      await sleep(10);
    }
    const cancellation = Date.now();
    await manager.cancel('chat', 'resistant', started.jobId);
    const result = await done(manager, started);
    assert.equal(result.status, 'cancelled'); assert.equal(result.signal, 'SIGKILL');
    assert.ok(Date.now() - cancellation < 1500);
  } finally { await rm(root, { recursive: true, force: true }); }
});
