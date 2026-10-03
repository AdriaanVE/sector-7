import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, open, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDeflateRaw } from 'node:zlib';
import { once } from 'node:events';
import { zipSync, strToU8 } from 'fflate';
import { createDConversation } from '~/common/stores/chat/chat.conversation';
import { createDMessageFromFragments } from '~/common/stores/chat/chat.message';
import { emptyWorkspace } from '~/common/personal/workspace-schema';
import { backupWorkspace, commitWorkspace, loadWorkspace, restoreWorkspace, writeAsset, readAsset, WorkspaceError } from './workspace';
import { BACKUP_ENTRY_LIMIT, decodeBackup, storedBackupSize, WORKSPACE_BYTE_LIMIT } from './workspace-archive';
import { readBoundedBody } from './request-body';
import { PUT as putAsset } from '../../../app/api/local/assets/[id]/route';
import { POST as restoreRoute } from '../../../app/api/local/restore/route';
import { POST as foldersRoute } from '../../../app/api/local/folders/route';

function chunkedRequest(path: string, limit: number) {
  let reads = 0; let cancelled = false;
  const chunk = new Uint8Array(1024 * 1024);
  const stream = new ReadableStream<Uint8Array>({ pull(controller) { reads++; controller.enqueue(chunk); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  const request = new Request(`http://localhost${path}`, { method: 'POST', headers: { host: 'localhost', 'content-type': 'application/json', 'x-ai-gui': '1' }, body: stream, duplex: 'half' } as RequestInit);
  request.arrayBuffer = async () => { throw new Error('Must not materialize unbounded body'); };
  return { request, verify() { assert.equal(reads, Math.floor(limit / chunk.length) + 1); assert.ok(cancelled); } };
}

test('chunked bodies cancel at the bound and declared oversized bodies are never read', async () => {
  const input = chunkedRequest('/api/local/test', 2 * 1024 * 1024);
  await assert.rejects(readBoundedBody(input.request, 2 * 1024 * 1024), (error: unknown) => error instanceof WorkspaceError && error.status === 413);
  input.verify();
  let read = false; let cancelled = false;
  const request = new Request('http://localhost', { method: 'POST', headers: { 'content-length': '100' }, body: new ReadableStream({ pull() { read = true; }, cancel() { cancelled = true; } }, { highWaterMark: 0 }), duplex: 'half' } as RequestInit);
  await assert.rejects(readBoundedBody(request, 1), /limit/); assert.equal(read, false); assert.equal(cancelled, true);
});

test('real asset, restore and folder routes reject streamed oversize with HTTP 413', async () => {
  const asset = chunkedRequest('/api/local/assets/a', WORKSPACE_BYTE_LIMIT);
  assert.equal((await putAsset(asset.request, { params: Promise.resolve({ id: 'a' }) })).status, 413); asset.verify();
  const backup = chunkedRequest('/api/local/restore', WORKSPACE_BYTE_LIMIT);
  assert.equal((await restoreRoute(backup.request)).status, 413); backup.verify();
  const folder = chunkedRequest('/api/local/folders', 2 * 1024 * 1024);
  assert.equal((await foldersRoute(folder.request)).status, 413); folder.verify();
});

test('ZIP parsing rejects excessive entries and mismatched actual decoded sizes', () => {
  const entries = Object.fromEntries(Array.from({ length: BACKUP_ENTRY_LIMIT + 1 }, (_, i) => [`assets/a${i}`, new Uint8Array()]));
  assert.throws(() => decodeBackup(zipSync(entries, { level: 0 })), /entry limit/);
  const bytes = zipSync({ 'workspace.json': strToU8(JSON.stringify(emptyWorkspace())) });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const central = view.getUint32(bytes.length - 6, true);
  view.setUint32(22, 1, true); view.setUint32(central + 24, 1, true);
  assert.throws(() => decodeBackup(bytes), /damaged entry data/);
  assert.throws(() => decodeBackup(new Uint8Array()), /invalid/);
  const duplicate = zipSync({ 'assets/a': new Uint8Array([1]), 'assets/b': new Uint8Array([2]) }, { level: 0 });
  const duplicateView = new DataView(duplicate.buffer, duplicate.byteOffset, duplicate.byteLength);
  const firstCentral = duplicateView.getUint32(duplicate.length - 6, true);
  const secondCentral = firstCentral + 46 + 'assets/a'.length;
  const secondLocal = duplicateView.getUint32(secondCentral + 42, true);
  duplicate[secondCentral + 46 + 7] = 'a'.charCodeAt(0); duplicate[secondLocal + 30 + 7] = 'a'.charCodeAt(0);
  assert.throws(() => decodeBackup(duplicate), /duplicate entry/);
  assert.throws(() => decodeBackup(zipSync({ '../workspace.json': new Uint8Array() })), /unexpected path/);
  const damaged = zipSync({ 'workspace.json': new Uint8Array([1]) }, { level: 0 }); damaged[30 + 'workspace.json'.length] = 2;
  assert.throws(() => decodeBackup(damaged), /damaged entry data/);
});

test('actual decompression exceeding 250 MB rejects a bomb with false declared sizes', async () => {
  // Produce a tiny deflated payload using fixed-size chunks, rather than allocating the expanded bomb.
  const deflater = createDeflateRaw(); const chunks: Buffer[] = [];
  deflater.on('data', chunk => chunks.push(chunk));
  const completed = once(deflater, 'end');
  const chunk = Buffer.alloc(1024 * 1024);
  for (let i = 0; i <= WORKSPACE_BYTE_LIMIT / chunk.length; i++) { if (!deflater.write(chunk)) await once(deflater, 'drain'); }
  deflater.end(); await completed;
  const compressed = Buffer.concat(chunks); const name = Buffer.from('workspace.json');
  const local = Buffer.alloc(30 + name.length); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(8, 8); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(1, 22); local.writeUInt16LE(name.length, 26); name.copy(local, 30);
  const central = Buffer.alloc(46 + name.length); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(8, 10); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(1, 24); central.writeUInt16LE(name.length, 28); name.copy(central, 46);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(local.length + compressed.length, 16);
  assert.throws(() => decodeBackup(Buffer.concat([local, compressed, central, end])), (error: unknown) => error instanceof WorkspaceError && error.status === 413);
});

test('an exported backup at the exact 250 MB bound reimports; over-bound export preserves the primary', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sector-7-bound-')); const other = await mkdtemp(join(tmpdir(), 'sector-7-bound-restore-'));
  try {
    const workspace = emptyWorkspace(); const { _abortController, ...chat } = createDConversation();
    const size = WORKSPACE_BYTE_LIMIT - 2048;
    chat.messages = [createDMessageFromFragments('user', [{ ft: 'content', fId: 'img', part: { pt: 'image_ref', dataRef: { reftype: 'dblob', dblobAssetId: 'large', mimeType: 'image/png', bytesSize: size } } }])];
    workspace.stores['app-chats'] = { version: 5, state: { conversations: [chat] } };
    workspace.assets.large = { size, mime: 'image/png', metadata: {} };
    await writeAsset('large', new Uint8Array(), dir);
    const file = await open(join(dir, 'assets', 'large'), 'r+');
    await file.truncate(size);
    const saved = await commitWorkspace(workspace, 0, dir);
    const jsonSize = Buffer.byteLength(JSON.stringify(saved));
    const exactAssetSize = WORKSPACE_BYTE_LIMIT - storedBackupSize([{ name: 'workspace.json', size: jsonSize }, { name: 'assets/large', size: 0 }]);
    saved.assets.large.size = exactAssetSize;
    await file.truncate(exactAssetSize); await file.close();
    // Same digit count and revision count keep serialized metadata size stable at this boundary.
    await commitWorkspace(saved, 1, dir);
    const backup = await backupWorkspace(dir); assert.equal(backup.length, WORKSPACE_BYTE_LIMIT);
    await restoreWorkspace(backup, 0, other);
    assert.equal((await loadWorkspace(other)).workspace?.assets.large.size, exactAssetSize);
    const current = (await loadWorkspace(dir)).workspace!;
    current.assets.large.size++; const larger = await open(join(dir, 'assets', 'large'), 'r+'); await larger.truncate(current.assets.large.size); await larger.close();
    await commitWorkspace(current, current.revision, dir);
    await assert.rejects(backupWorkspace(dir), /250 MB limit/);
    assert.equal((await readFile(join(dir, 'workspace.json'))).length > 0, true);
  } finally { await rm(dir, { recursive: true, force: true }); await rm(other, { recursive: true, force: true }); }
});


test('asset GET streams bytes and supports consumption and cancellation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sector-7-stream-'));
  try {
    await writeAsset('a', new Uint8Array([1, 2, 3]), directory);
    const body = await readAsset('a', directory);
    assert.ok(body instanceof ReadableStream);
    assert.deepEqual([...new Uint8Array(await new Response(body).arrayBuffer())], [1, 2, 3]);
    await (await readAsset('a', directory)).cancel();
    await writeAsset('empty', new Uint8Array(), directory);
    assert.equal((await new Response(await readAsset('empty', directory)).arrayBuffer()).byteLength, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
