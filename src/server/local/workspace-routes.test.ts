import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDConversation } from '~/common/stores/chat/chat.conversation';
import { createDMessageTextContent } from '~/common/stores/chat/chat.message';
import { emptyWorkspace } from '~/common/personal/workspace-schema';
import { GET as getWorkspace, PUT as putWorkspace } from '../../../app/api/local/workspace/route';
import { GET as getAsset, PUT as putAsset } from '../../../app/api/local/assets/[id]/route';
import { GET as getBackup } from '../../../app/api/local/backup/route';
import { POST as restoreBackup } from '../../../app/api/local/restore/route';

async function storage(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'sector7-http-'));
  const previous = process.env.AI_GUI_DATA_DIR;
  process.env.AI_GUI_DATA_DIR = directory;
  t.after(async () => {
    if (previous === undefined) delete process.env.AI_GUI_DATA_DIR;
    else process.env.AI_GUI_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

function request(body?: unknown, path = '/workspace') {
  return new Request(`http://localhost:3004/api/local${path}`, body === undefined ? undefined : {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

async function savedWorkspace() {
  const response = await getWorkspace(request());
  assert.equal(response.status, 200);
  return (await response.json()).workspace;
}

function workspaceWithChat() {
  const workspace = emptyWorkspace();
  const { _abortController, ...chat } = createDConversation();
  chat.userTitle = 'Saved conversation';
  chat.messages = [createDMessageTextContent('user', 'Keep this message')];
  workspace.stores['app-chats'] = { version: 5, state: { conversations: [chat] } };
  workspace.stores['app-folders'] = { version: 1, state: { enableFolders: true, folders: [
    { id: 'project', title: 'Saved project', instructions: 'Review carefully', revision: 1, fileIds: [], conversationIds: [chat.id] },
  ] } };
  return workspace;
}

test('workspace HTTP save makes the chat and project retrievable at the next revision', async t => {
  await storage(t);
  const workspace = workspaceWithChat();
  const response = await putWorkspace(request({ workspace, expectedRevision: 0 }));
  assert.equal(response.status, 200);
  const loaded = await getWorkspace(request());
  assert.equal(loaded.status, 200);
  const actual = (await loaded.json()).workspace;
  assert.equal(actual.revision, 1);
  assert.deepEqual(actual.stores, JSON.parse(JSON.stringify(workspace.stores)));
});

test('stale workspace HTTP saves return 409 and preserve the winning chat', async t => {
  await storage(t);
  const workspace = workspaceWithChat();
  assert.equal((await putWorkspace(request({ workspace, expectedRevision: 0 }))).status, 200);
  const rejected = await putWorkspace(request({ workspace: emptyWorkspace(), expectedRevision: 0 }));
  assert.equal(rejected.status, 409);
  assert.match((await rejected.json()).error, /newer data/);
  const loaded = await savedWorkspace();
  assert.equal(loaded.revision, 1);
  assert.deepEqual(loaded.stores, JSON.parse(JSON.stringify(workspace.stores)));
});

test('malformed JSON and invalid revisions return HTTP 400 without changing saved data', async t => {
  await storage(t);
  assert.equal((await putWorkspace(request({ workspace: workspaceWithChat(), expectedRevision: 0 }))).status, 200);
  const before = await savedWorkspace();
  const malformed = new Request('http://localhost:3004/api/local/workspace', { method: 'PUT', body: '{' });
  assert.equal((await putWorkspace(malformed)).status, 400);
  for (const expectedRevision of [undefined, null, '1', -1, 1.5]) {
    const response = await putWorkspace(request({ workspace: emptyWorkspace(), expectedRevision }));
    assert.equal(response.status, 400, `revision ${String(expectedRevision)}`);
    assert.deepEqual(await savedWorkspace(), before);
  }
});

test('recovery HTTP query distinguishes saved revisions from a corrupt workspace', async t => {
  const directory = await storage(t);
  assert.deepEqual(await (await getWorkspace(request(undefined, '/workspace?recovery'))).json(), { revision: 0 });
  await putWorkspace(request({ workspace: workspaceWithChat(), expectedRevision: 0 }));
  assert.deepEqual(await (await getWorkspace(request(undefined, '/workspace?recovery'))).json(), { revision: 1 });
  await writeFile(join(directory, 'workspace.json'), 'damaged save');
  assert.equal((await getWorkspace(request())).status, 422);
  const recovery = await getWorkspace(request(undefined, '/workspace?recovery'));
  assert.equal(recovery.status, 200);
  assert.deepEqual(await recovery.json(), { revision: 'corrupt' });
});

test('asset HTTP upload returns the original binary bytes without text conversion or caching', async t => {
  await storage(t);
  const params = { params: Promise.resolve({ id: 'original' }) };
  const uploaded = await putAsset(new Request('http://localhost:3004/api/local/assets/original', {
    method: 'PUT', body: new Uint8Array([0, 255, 128, 13, 10]),
  }), params);
  assert.equal(uploaded.status, 200);
  const downloaded = await getAsset(request(undefined, '/assets/original'), params);
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.headers.get('content-type'), 'application/octet-stream');
  assert.equal(downloaded.headers.get('cache-control'), 'no-store');
  assert.deepEqual([...new Uint8Array(await downloaded.arrayBuffer())], [0, 255, 128, 13, 10]);
});

test('asset HTTP overwrite returns 409 and leaves the immutable original retrievable', async t => {
  await storage(t);
  const params = { params: Promise.resolve({ id: 'original' }) };
  const upload = (bytes: number[]) => putAsset(new Request('http://localhost:3004/api/local/assets/original', {
    method: 'PUT', body: new Uint8Array(bytes),
  }), params);
  assert.equal((await upload([1, 2, 3])).status, 200);
  assert.equal((await upload([3, 2, 1])).status, 409);
  const downloaded = await getAsset(request(undefined, '/assets/original'), params);
  assert.deepEqual([...new Uint8Array(await downloaded.arrayBuffer())], [1, 2, 3]);
});

test('restore HTTP requires the current revision header before replacing a saved workspace', async t => {
  await storage(t);
  await putWorkspace(request({ workspace: workspaceWithChat(), expectedRevision: 0 }));
  const archive = await (await getBackup()).arrayBuffer();
  await putWorkspace(request({ workspace: emptyWorkspace(), expectedRevision: 1 }));
  const before = await savedWorkspace();
  for (const revision of [undefined, '', 'invalid', 'corrupt', '1']) {
    const headers = new Headers();
    if (revision !== undefined) headers.set('x-workspace-revision', revision);
    const response = await restoreBackup(new Request('http://localhost:3004/api/local/restore', { method: 'POST', headers, body: archive }));
    assert.equal(response.status, 409, `revision ${String(revision)}`);
    assert.deepEqual(await savedWorkspace(), before);
  }
  const restored = await restoreBackup(new Request('http://localhost:3004/api/local/restore', {
    method: 'POST', headers: { 'x-workspace-revision': '2' }, body: archive,
  }));
  assert.equal(restored.status, 200);
  const actual = await savedWorkspace();
  assert.equal(actual.revision, 3);
  assert.equal(actual.stores['app-chats'].state.conversations[0].userTitle, 'Saved conversation');
});
