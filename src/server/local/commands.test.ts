import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
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
    assert.equal((await manager.cancelStart(request)).status, 'succeeded');
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

test('cancel-start reserves a durable cancelled invocation before any delayed start', async () => {
  const { root, manager } = await fixture();
  try {
    const request = { scope: 'chat', invocationId: 'never-started', root, command: 'printf escaped > executions' };
    const cancelled = await manager.cancelStart(request);
    assert.equal(cancelled.status, 'cancelled');
    assert.ok(cancelled.finishedAt !== null);
    assert.deepEqual(cancelled.chunks, []);
    const receipt = JSON.parse(await readFile(join(root, 'receipts', `${cancelled.jobId}.json`), 'utf8'));
    assert.equal(receipt.status, 'cancelled');
    assert.equal((await manager.start({ ...request, timeoutMs: 60_000 })).jobId, cancelled.jobId);
    const restarted = new LocalCommandManager(join(root, 'receipts'));
    assert.equal((await restarted.start(request)).status, 'cancelled');
    assert.equal((await restarted.cancelStart(request)).status, 'cancelled');
    for (const changed of [{ command: 'true' }, { root: tmpdir() }, { timeoutMs: 1 }]) {
      await assert.rejects(restarted.start({ ...request, ...changed }), /different arguments/);
    }
    await assert.rejects(readFile(join(root, 'executions')), { code: 'ENOENT' });
  } finally { manager.shutdown(); await rm(root, { recursive: true, force: true }); }
});

test('cancel-start and start serialize in either request order and stop descendants', async () => {
  const { root, manager } = await fixture();
  try {
    for (const first of ['cancel', 'start'] as const) {
      const request = { scope: 'chat', invocationId: first, root, command: `(sleep 1; printf escaped > ${first}-escaped) & wait` };
      const operations = first === 'cancel'
        ? [manager.cancelStart(request), manager.start(request)]
        : [manager.start(request), manager.cancelStart(request)];
      const [one, two] = await Promise.all(operations);
      assert.equal(one.jobId, two.jobId);
      assert.equal(one.status, first === 'start' ? 'running' : 'cancelled');
      assert.equal((await done(manager, two)).status, 'cancelled');
      assert.equal((await manager.start(request)).status, 'cancelled');
    }
    await sleep(1100);
    for (const first of ['cancel', 'start']) await assert.rejects(readFile(join(root, `${first}-escaped`)), { code: 'ENOENT' });
  } finally { manager.shutdown(); await rm(root, { recursive: true, force: true }); }
});

test('cancel-start reaches its invocation after root changes and leaves other scopes running', async () => {
  const { root, manager } = await fixture();
  try {
    const request = { scope: 'chat', invocationId: 'identity', root, command: 'sleep 30' };
    const started = await manager.start(request);
    const other = await manager.start({ ...request, scope: 'other-chat', command: 'printf completed' });
    assert.notEqual(other.jobId, started.jobId);
    await manager.cancelStart({ ...request, root: tmpdir() });
    assert.equal((await done(manager, started)).status, 'cancelled');
    let remaining = other;
    for (let count = 0; remaining.status === 'running' && count < 100; count++) {
      await sleep(20);
      remaining = await manager.poll('other-chat', request.invocationId, other.jobId);
    }
    assert.equal(remaining.status, 'succeeded');
  } finally { manager.shutdown(); await rm(root, { recursive: true, force: true }); }
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
  const { create_FunctionCallInvocation_ContentFragment, create_FunctionCallResponse_ContentFragment } = await import('~/common/stores/chat/chat.fragments');
  const { createDMessageFromFragments } = await import('~/common/stores/chat/chat.message');
  const root = await mkdtemp(join(tmpdir(), 'sector7-command-route-'));
  const previous = process.env.AI_GUI_DATA_DIR; process.env.AI_GUI_DATA_DIR = root;
  try {
    const folder = await validateFolderPath(root); const workspace = emptyWorkspace();
    const invocationId = 'route-call'; const command = 'sleep 30';
    workspace.stores['app-folders'] = { version: 1, state: { folders: [{ id: 'project', title: 'Project', conversationIds: ['chat'], instructions: '', fileIds: [], revision: 1, connectedFolders: [folder] }], enableFolders: true } };
    const message = createDMessageFromFragments('assistant', [create_FunctionCallInvocation_ContentFragment(invocationId, 'local_command', JSON.stringify({ folder_id: folder.id, command }))]);
    workspace.stores['app-chats'] = { version: 5, state: { conversations: [{ id: 'chat', messages: [message], created: 0, updated: null, tokenCount: 0, systemPurposeId: '' }] } };
    const lateId = 'late-start'; const lateCommand = 'printf escaped > late-start';
    message.fragments.push(create_FunctionCallInvocation_ContentFragment(lateId, 'local_command', JSON.stringify({ folder_id: folder.id, command: lateCommand })));
    const saved = await commitWorkspace(workspace, 0, root);
    const identity = { projectId: 'project', conversationId: 'chat', folderId: folder.id, invocationId };
    const request = (body: object, signal?: AbortSignal, origin = 'http://127.0.0.1:3004') => new Request('http://127.0.0.1:3004/api/local/commands', { method: 'POST', headers: { host: '127.0.0.1:3004', 'content-type': 'application/json', origin }, body: JSON.stringify(body), signal });
    assert.equal((await POST(request({ ...identity, action: 'start', command: 'false' }))).status, 409);
    assert.equal((await POST(request({ ...identity, conversationId: 'other', action: 'start', command }))).status, 403);
    assert.equal((await POST(request({ ...identity, action: 'start', command }, undefined, 'http://evil.example'))).status, 403);
    const lateIdentity = { ...identity, invocationId: lateId };
    for (const tamper of [{ command: 'false' }, { timeoutMs: 1000 }])
      assert.equal((await POST(request({ ...lateIdentity, action: 'cancel-start', command: lateCommand, ...tamper }))).status, 409);
    for (const tamper of [{ projectId: 'other' }, { conversationId: 'other' }, { folderId: 'other' }, { invocationId: 'unsaved' }])
      assert.equal((await POST(request({ ...lateIdentity, action: 'cancel-start', command: lateCommand, ...tamper }))).status, 403);
    assert.equal((await POST(request({ ...lateIdentity, action: 'cancel-start', command: lateCommand }, undefined, 'http://evil.example'))).status, 403);
    const cancelled = await POST(request({ ...lateIdentity, action: 'cancel-start', command: lateCommand }));
    assert.equal(cancelled.status, 200);
    const cancelledJob = await cancelled.json(); assert.equal(cancelledJob.status, 'cancelled');
    const late = await POST(request({ ...lateIdentity, action: 'start', command: lateCommand, timeoutMs: 60_000 }));
    assert.equal(late.status, 200);
    const lateJob = await late.json(); assert.equal(lateJob.jobId, cancelledJob.jobId); assert.equal(lateJob.status, 'cancelled');
    assert.equal(JSON.parse(await readFile(join(root, 'commands', `${cancelledJob.jobId}.json`), 'utf8')).status, 'cancelled');
    await assert.rejects(readFile(join(root, 'late-start')), { code: 'ENOENT' });
    const aborted = new AbortController(); aborted.abort();
    const start = await POST(request({ ...identity, action: 'start', command }, aborted.signal));
    assert.equal(start.status, 200); const job = await start.json();
    let result;
    for (let count = 0; count < 100; count++) {
      result = await (await POST(request({ ...identity, action: 'poll', jobId: job.jobId }))).json();
      if (result.status !== 'running') break; await sleep(20);
    }
    assert.equal(result.status, 'cancelled');
    message.fragments.push(create_FunctionCallResponse_ContentFragment(lateId, false, 'local_command', '{"status":"cancelled"}', 'client'));
    await commitWorkspace({ ...workspace, revision: saved.revision }, saved.revision, root);
    assert.equal((await POST(request({ ...lateIdentity, action: 'start', command: lateCommand }))).status, 409);
    const settledCancellation = await POST(request({ ...lateIdentity, action: 'cancel-start', command: lateCommand }));
    assert.equal(settledCancellation.status, 200);
    assert.equal((await settledCancellation.json()).status, 'cancelled');
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

test('command HTTP route runs in a default skill folder without a project and rejects tampered or unsaved calls', async () => {
  const { POST } = await import('../../../app/api/local/commands/route');
  const { POST: folderPost } = await import('../../../app/api/local/folders/route');
  const { emptyWorkspace } = await import('~/common/personal/workspace-schema');
  const { commitWorkspace } = await import('./workspace');
  const { create_FunctionCallInvocation_ContentFragment } = await import('~/common/stores/chat/chat.fragments');
  const { createDMessageFromFragments } = await import('~/common/stores/chat/chat.message');
  const directory = await mkdtemp(join(tmpdir(), 'sector7-default-command-'));
  const previous = process.env.AI_GUI_DATA_DIR; process.env.AI_GUI_DATA_DIR = directory;
  try {
    const workspace = emptyWorkspace();
    const message = createDMessageFromFragments('assistant', [create_FunctionCallInvocation_ContentFragment('default-call', 'local_command', JSON.stringify({ folder_id: 'local-codex', command: 'pwd' }))]);
    message.fragments.push(create_FunctionCallInvocation_ContentFragment('default-list', 'folder_list', JSON.stringify({ folder_id: 'local-codex', path: '' })));
    workspace.stores['app-chats'] = { version: 5, state: { conversations: [{ id: 'chat', messages: [message], created: 0, updated: null, tokenCount: 0, systemPurposeId: '' }] } };
    await commitWorkspace(workspace, 0, directory);
    const listing = await folderPost(new Request('http://127.0.0.1:3004/api/local/folders', { method: 'POST', headers: { host: '127.0.0.1:3004', 'content-type': 'application/json' }, body: JSON.stringify({ conversationId: 'chat', invocationId: 'default-list', input: { name: 'folder_list', folder_id: 'local-codex', path: '' } }) }));
    assert.equal(listing.status, 200);
    assert.ok(Array.isArray((await listing.json()).entries));
    const identity = { conversationId: 'chat', folderId: 'local-codex', invocationId: 'default-call' };
    const request = (body: object) => new Request('http://127.0.0.1:3004/api/local/commands', { method: 'POST', headers: { host: '127.0.0.1:3004', 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await POST(request({ ...identity, action: 'start', command: 'false' }))).status, 409);
    for (const tamper of [{ conversationId: 'other' }, { invocationId: 'unsaved' }, { folderId: 'unknown' }])
      assert.equal((await POST(request({ ...identity, ...tamper, action: 'start', command: 'pwd' }))).status, 403);
    const response = await POST(request({ ...identity, action: 'start', command: 'pwd' }));
    assert.equal(response.status, 200);
    let job = await response.json();
    const initialJobId = job.jobId;
    for (let count = 0; job.status === 'running' && count < 100; count++) {
      await sleep(20);
      job = await (await POST(request({ ...identity, action: 'poll', jobId: job.jobId }))).json();
    }
    assert.equal(job.status, 'succeeded');
    assert.equal(job.chunks.map((chunk: { text: string }) => chunk.text).join('').trim(), await realpath(join(homedir(), '.codex')));
    const replay = await (await POST(request({ ...identity, action: 'start', command: 'pwd' }))).json();
    assert.equal(replay.jobId, initialJobId);
    assert.equal(replay.status, 'succeeded');
  } finally {
    if (previous === undefined) delete process.env.AI_GUI_DATA_DIR; else process.env.AI_GUI_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test('desktop command subprocesses do not inherit API credentials or Electron runtime flags', async () => {
  const { root, manager } = await fixture();
  const keys = ['SECTOR7_DESKTOP_TOKEN', 'ELECTRON_RUN_AS_NODE', 'ANTHROPIC_API_KEY'];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) process.env[key] = 'desktop-test-value';
  try {
    const result = await done(manager, await manager.start({ scope: 'chat', invocationId: 'desktop-env', root,
      command: 'for name in SECTOR7_DESKTOP_TOKEN ELECTRON_RUN_AS_NODE ANTHROPIC_API_KEY; do if printenv "$name"; then exit 9; fi; done; printf clean' }));
    assert.equal(result.status, 'succeeded');
    assert.equal(result.chunks.map(chunk => chunk.text).join(''), 'clean');
  } finally {
    for (const key of keys) if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
    manager.shutdown(); await rm(root, { recursive: true, force: true });
  }
});
