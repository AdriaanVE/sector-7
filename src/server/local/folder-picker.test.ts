import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNativeFolderPicker } from './folder-picker';
import { WorkspaceError } from './workspace';

const succeeded = (stdout: string) => ({ stdout, stderr: '', exitCode: 0 });
function heldRunner() {
  let signal: AbortSignal | undefined;
  let finish!: (value: ReturnType<typeof succeeded>) => void;
  let calls = 0;
  const runner = (value: AbortSignal) => {
    signal = value; calls++;
    return new Promise<ReturnType<typeof succeeded>>(resolve => { finish = resolve; });
  };
  return { runner, get signal() { return signal; }, get calls() { return calls; }, finish: () => finish(succeeded('/not-selected\n')) };
}

test('native selection keeps path whitespace, resolves aliases and never reads directory contents', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'sector7-picker-'));
  const root = join(temp, 'folder \n '); const alias = join(temp, 'alias');
  try {
    await mkdir(root); await symlink(root, alias);
    const picker = createNativeFolderPicker({ platform: 'darwin', runner: async () => succeeded(`${alias}/\n`) });
    const result = await picker();
    assert.ok('folder' in result);
    assert.equal(result.folder.path, await realpath(root));
    assert.equal(result.folder.name, 'folder \n ');
    const again = await picker(); assert.ok('folder' in again);
    assert.notEqual(again.folder.id, result.folder.id);
    const whitespace = await createNativeFolderPicker({ platform: 'darwin', runner: async () => succeeded(`${root}/\n`) })();
    assert.ok('folder' in whitespace); assert.equal(whitespace.folder.path, result.folder.path);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('only native cancellation is silent; malformed output, filesystem root and native failure are rejected', async () => {
  const pick = (stdout: string, stderr = '', exitCode: number | null = 0) => createNativeFolderPicker({ platform: 'darwin', runner: async () => ({ stdout, stderr, exitCode }) })();
  assert.deepEqual(await pick('', '', 2), { cancelled: true });
  await assert.rejects(pick('', 'execution error: Not authorized. (-1743)\n', 1), error => error instanceof WorkspaceError && error.status === 502);
  await assert.rejects(pick('/tmp'), /invalid path/);
  await assert.rejects(pick('/\n'), /filesystem root/);
  await assert.rejects(pick('relative\n'), /absolute folder path/);
});

test('a duplicate request cannot spawn another picker and reservation ends only after native close', async () => {
  const held = heldRunner();
  const picker = createNativeFolderPicker({ platform: 'darwin', runner: held.runner });
  const controller = new AbortController(); const first = picker(controller.signal);
  await assert.rejects(picker(), error => error instanceof WorkspaceError && error.status === 409);
  assert.equal(held.calls, 1);
  controller.abort(); assert.equal(held.signal?.aborted, true);
  await assert.rejects(picker(), /already open/);
  held.finish(); assert.deepEqual(await first, { cancelled: true });
  const nextController = new AbortController();
  const next = picker(nextController.signal); assert.equal(held.calls, 2);
  nextController.abort(); held.finish();
  assert.deepEqual(await next, { cancelled: true });
});

test('timeout terminates the runner and keeps the gate until it exits', async () => {
  const held = heldRunner(); const picker = createNativeFolderPicker({ platform: 'darwin', runner: held.runner, timeoutMs: 10 });
  const first = picker();
  await new Promise<void>(resolve => held.signal?.addEventListener('abort', () => resolve(), { once: true }));
  assert.equal(held.signal?.aborted, true);
  await assert.rejects(picker(), /already open/);
  held.finish(); await assert.rejects(first, error => error instanceof WorkspaceError && error.status === 408);
});

test('aborted requests and unsupported platforms cannot invoke the runner, and runner failure releases the gate', async () => {
  let calls = 0;
  const runner = async () => { calls++; throw new Error('failed launch'); };
  const cancelled = new AbortController(); cancelled.abort();
  const picker = createNativeFolderPicker({ platform: 'darwin', runner });
  assert.deepEqual(await picker(cancelled.signal), { cancelled: true }); assert.equal(calls, 0);
  await assert.rejects(createNativeFolderPicker({ platform: 'linux', runner })(), error => error instanceof WorkspaceError && error.status === 501);
  assert.equal(calls, 0);
  await assert.rejects(picker(), /failed launch/); await assert.rejects(picker(), /failed launch/); assert.equal(calls, 2);
});

test('folder route applies local access restrictions before starting a picker', async () => {
  const { POST } = await import('../../../app/api/local/folders/route');
  const request = (origin: string, host = '127.0.0.1:3004', signal?: AbortSignal) => new Request('http://127.0.0.1:3004/api/local/folders', {
    method: 'POST', headers: { host, 'content-type': 'application/json', origin }, body: JSON.stringify({ action: 'pick' }), signal,
  });
  assert.equal((await POST(request('http://evil.example'))).status, 403);
  assert.equal((await POST(request('http://evil.example', 'evil.example'))).status, 403);
  const aborted = new AbortController(); aborted.abort();
  const cancelled = await POST(request('http://127.0.0.1:3004', '127.0.0.1:3004', aborted.signal));
  assert.equal(cancelled.status, 200); assert.deepEqual(await cancelled.json(), { cancelled: true });
});

test('connecting a chosen folder rejects non-string paths instead of coercing them', async () => {
  const { POST } = await import('../../../app/api/local/folders/route');
  const directory = await mkdtemp(join(tmpdir(), 'sector7-connect-'));
  try {
    const response = await POST(new Request('http://127.0.0.1:3004/api/local/folders', {
      method: 'POST', headers: { host: '127.0.0.1:3004', 'content-type': 'application/json', origin: 'http://127.0.0.1:3004' },
      body: JSON.stringify({ action: 'connect', path: [directory] }),
    }));
    assert.equal(response.status, 400);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
