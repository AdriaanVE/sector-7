import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { emptyWorkspace, validateWorkspace } from '~/common/personal/workspace-schema';
import { commitWorkspace, loadWorkspace, writeAsset } from './workspace';
import { withWorkspaceLock, WorkspaceLockBusyError } from './workspace-lock';

const childSource = `
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import schema from './src/common/personal/workspace-schema.ts';
import workspaceModule from './src/server/local/workspace.ts';
import lockModule from './src/server/local/workspace-lock.ts';
const { emptyWorkspace } = schema;
const { commitWorkspace, writeAsset } = workspaceModule;
const { withWorkspaceLock } = lockModule;
const [action, directory, candidate] = JSON.parse(process.argv[1]);
const start = once(process, 'message');
process.send({ ready: true });
await start;
try {
  let result;
  if (action === 'commit') {
    const workspace = emptyWorkspace();
    if (candidate === 'chats') workspace.stores['app-chats'] = { version: 5, state: { conversations: [] } };
    result = await commitWorkspace(workspace, 1, directory);
  } else if (action === 'asset') {
    await writeAsset('shared', Buffer.from(candidate), directory);
    result = candidate;
  } else if (action === 'hold') {
    await withWorkspaceLock(directory, async () => {
      // Emulate a crashed atomic write without publishing its temporary bytes.
      await writeFile(join(directory, 'workspace.json.crash.tmp'), 'unpublished');
      const release = once(process, 'message');
      process.send({ held: true });
      await release;
    });
    result = 'released';
  }
  process.send({ ok: true, result });
} catch (error) { process.send({ ok: false, error: error.message, status: error.status }); }
process.disconnect();
`;

type Outcome = { ok: boolean; result?: unknown; error?: string; status?: number };

async function worker(action: string, directory: string, candidate = '') {
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', childSource, JSON.stringify([action, directory, candidate])], {
    cwd: process.cwd(), stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  let stderr = '';
  child.stderr?.on('data', bytes => { stderr += bytes.toString(); });
  const messages: unknown[] = [];
  let receive: ((value: unknown) => void) | undefined;
  child.on('message', message => {
    if (receive) { const resolve = receive; receive = undefined; resolve(message); }
    else messages.push(message);
  });
  const next = async (): Promise<unknown> => messages.length ? messages.shift() : new Promise((resolve, reject) => {
    receive = resolve;
    child.once('error', reject);
    child.once('exit', code => { if (receive) reject(new Error(`Worker exited ${code}: ${stderr}`)); });
  });
  const exit = once(child, 'exit');
  assert.deepEqual(await next(), { ready: true });
  return { child, next, exit, start: () => child.send('start') };
}

async function directory(t: TestContext) {
  const path = await mkdtemp(join(tmpdir(), 'sector7-shared-lock-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test('separate processes saving the same revision return exactly one winner and preserve its actual content', { timeout: 15_000 }, async t => {
  const dir = await directory(t);
  await commitWorkspace(emptyWorkspace(), 0, dir);
  const contenders = await Promise.all([worker('commit', dir, 'chats'), worker('commit', dir, 'empty')]);
  t.after(() => { contenders.forEach(({ child }) => child.kill()); });
  const outcomesPromise = Promise.all(contenders.map(({ next }) => next()));
  contenders.forEach(({ start }) => start());
  const outcomes = await outcomesPromise as Outcome[];
  assert.equal(outcomes.filter(result => result.ok).length, 1);
  assert.equal(outcomes.filter(result => !result.ok && result.status === 409 && /newer data/.test(result.error!)).length, 1);
  const winner = outcomes.find(result => result.ok)!;
  const actual = validateWorkspace(JSON.parse(await readFile(join(dir, 'workspace.json'), 'utf8')));
  assert.equal(actual.revision, 2);
  assert.deepEqual(actual, winner.result);
  assert.equal(JSON.parse(await readFile(join(dir, 'workspace.last-good.json'), 'utf8')).revision, 1);
  await Promise.all(contenders.map(({ exit }) => exit));
});

test('concurrent separate-process asset creates never overwrite an immutable ID', { timeout: 15_000 }, async t => {
  const dir = await directory(t);
  const contenders = await Promise.all([worker('asset', dir, 'first bytes'), worker('asset', dir, 'other bytes')]);
  t.after(() => { contenders.forEach(({ child }) => child.kill()); });
  const outcomesPromise = Promise.all(contenders.map(({ next }) => next()));
  contenders.forEach(({ start }) => start());
  const outcomes = await outcomesPromise as Outcome[];
  assert.equal(outcomes.filter(result => result.ok).length, 1);
  assert.equal(outcomes.filter(result => !result.ok && result.status === 409 && /immutable/.test(result.error!)).length, 1);
  assert.equal(await readFile(join(dir, 'assets', 'shared'), 'utf8'), outcomes.find(result => result.ok)!.result);
  await Promise.all(contenders.map(({ exit }) => exit));
});

test('live holder cannot expire; killing it releases ownership without replacing the lock inode', { timeout: 15_000 }, async t => {
  const dir = await directory(t);
  const other = await directory(t);
  const saved = await commitWorkspace(emptyWorkspace(), 0, dir);
  const holder = await worker('hold', dir);
  t.after(() => holder.child.kill());
  holder.start();
  assert.deepEqual(await holder.next(), { held: true });
  const inode = (await stat(join(dir, '.workspace.lock'))).ino;
  // Timeout reports contention; it never reaps a live holder even when its lock is old.
  await assert.rejects(withWorkspaceLock(dir, async () => assert.fail('entered live holder'), 150), WorkspaceLockBusyError);
  assert.equal((await commitWorkspace(emptyWorkspace(), 0, other)).revision, 1);
  assert.equal(await readFile(join(dir, 'workspace.json'), 'utf8'), JSON.stringify(saved));
  holder.child.kill('SIGKILL');
  await holder.exit;
  const next = await commitWorkspace(saved, 1, dir);
  assert.equal(next.revision, 2);
  assert.equal((await stat(join(dir, '.workspace.lock'))).ino, inode);
  assert.equal(await readFile(join(dir, 'workspace.json.crash.tmp'), 'utf8'), 'unpublished');
  // A successor also owns the permanent inode; no crashed-owner cleanup can erase it.
  const successor = await worker('hold', dir);
  t.after(() => successor.child.kill());
  successor.start();
  assert.deepEqual(await successor.next(), { held: true });
  await assert.rejects(withWorkspaceLock(dir, async () => assert.fail('entered successor'), 150), WorkspaceLockBusyError);
  successor.child.send('release');
  assert.deepEqual(await successor.next(), { ok: true, result: 'released' });
  await successor.exit;
  assert.equal(JSON.stringify((await loadWorkspace(dir)).workspace), JSON.stringify(next));
});

test('separate descriptors serialize same-process operations and release after failure', async t => {
  const dir = await directory(t);
  await assert.rejects(withWorkspaceLock(dir, async () => { throw new Error('operation failed'); }), /operation failed/);
  await withWorkspaceLock(dir, async () => {
    await assert.rejects(withWorkspaceLock(dir, async () => assert.fail('nested lock entered'), 50), WorkspaceLockBusyError);
  });
  await writeAsset('shared', Buffer.from('stable'), dir);
  await writeAsset('shared', Buffer.from('stable'), dir);
  assert.equal(await readFile(join(dir, 'assets', 'shared'), 'utf8'), 'stable');
});
