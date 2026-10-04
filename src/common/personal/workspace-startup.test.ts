import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import { persist } from 'zustand/middleware';
import { initializeWorkspace } from './workspace-startup';
import { currentWorkspace, diskStorage, installWorkspace, LocalStorageHTTPError, pauseDiskWrites } from './disk-storage';
import { emptyWorkspace, validateWorkspace, type Workspace } from './workspace-schema';
import { createDConversation } from '~/common/stores/chat/chat.conversation';
import { createDMessageFromFragments, createDMessageTextContent } from '~/common/stores/chat/chat.message';
import { useChatStore } from '~/common/stores/chat/store-chats';

function durableChat(id: string, assetId?: string) {
  const { _abortController, ...chat } = createDConversation();
  chat.id = id;
  chat.messages = assetId ? [createDMessageFromFragments('user', [{ ft: 'attachment', fId: `${id}-image`, title: 'Original image', caption: '', created: 0, part: {
    pt: 'image_ref', dataRef: { reftype: 'dblob', dblobAssetId: assetId, mimeType: 'image/png', bytesSize: 6 },
  } }])] : [createDMessageTextContent('user', id)];
  return chat;
}

function legacyFixture() {
  const chats = { version: 5, state: { conversations: [
    { ...durableChat('legacy-chat', 'original-image'), _abortController: null },
    { ...durableChat('private-chat', 'private-image'), _isIncognito: true, _abortController: null },
  ], apiKey: 'fixture-secret', active: 'transient' } };
  const local = {
    'app-folders': JSON.stringify({ version: 0, state: { folders: [{ id: 'project', title: 'Legacy project', conversationIds: ['legacy-chat'] }], apiKey: 'fixture-secret' } }),
    'app-app-chat': JSON.stringify({ version: 3, state: { autoTitleChat: false, showSystemMessages: true, apiKey: 'fixture-secret', selectedModelId: 'transient' } }),
    'app-ui': JSON.stringify({ version: 3, state: { enterIsNewline: true, contentScaling: 1.2, accessToken: 'fixture-secret', modal: 'transient' } }),
    'app-personal-settings': JSON.stringify({ version: 1, state: { instructions: 'Must not migrate unlisted stores' } }),
    'app-llms': JSON.stringify({ state: { apiKey: 'fixture-secret' } }),
  };
  const bytes = Uint8Array.from([0, 255, 128, 13, 10, 1]);
  const assets = ['original-image', 'private-image', 'unsent-draft'].map(id => ({ id, data: { base64: Buffer.from(bytes).toString('base64'), mimeType: 'image/png' }, cache: { thumbnail: 'discard' }, scopeId: id === 'unsent-draft' ? 'attachment-drafts' : 'app-chat' }));
  const reads: string[] = [];
  return { chats, local, assets, bytes, reads, adapters: {
    chats: async () => { reads.push('app-chats'); return chats; },
    store: (name: string) => { reads.push(name); return local[name as keyof typeof local] ?? null; },
    assets: async () => { reads.push('assets'); return assets; },
  } };
}

function localServer(initial?: Workspace) {
  let saved = initial ? structuredClone(initial) : undefined;
  let saveError: string | undefined;
  let assetError: string | undefined;
  const uploads = new Map<string, Uint8Array>();
  const calls: string[] = [];
  let saves = 0;
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const path = String(input).replace('/api/local/', '');
    calls.push(`${init?.method ?? 'GET'} ${path}`);
    if (path.startsWith('assets/')) {
      assert.equal(init?.method, 'PUT');
      if (assetError) return Response.json({ error: assetError }, { status: 503 });
      assert.ok(init.body instanceof Uint8Array);
      uploads.set(path.slice('assets/'.length), Uint8Array.from(init.body));
      return Response.json({ saved: true });
    }
    assert.equal(path, 'workspace');
    if (!init?.method) return Response.json({ workspace: saved ?? null, directory: '/fixture/workspace' });
    assert.equal(init.method, 'PUT');
    saves++;
    if (saveError) return Response.json({ error: saveError }, { status: 503 });
    const body = JSON.parse(String(init.body));
    assert.equal(body.expectedRevision, saved?.revision ?? 0);
    const workspace = validateWorkspace(body.workspace);
    for (const id of Object.keys(workspace.assets)) if (!initial?.assets[id]) assert.ok(uploads.has(id));
    saved = { ...workspace, revision: (saved?.revision ?? 0) + 1, migrated: true };
    return Response.json({ workspace: saved });
  };
  return { fetch, calls, uploads, get saved() { return saved; }, get saves() { return saves; }, failSave: (message?: string) => { saveError = message; }, failAsset: (message?: string) => { assetError = message; } };
}

function hydrationStore(name = 'app-chats', version = 5, mergeFails = false) {
  return createStore<{ loaded: boolean }>()(persist(() => ({ loaded: false }), {
    name, version, skipHydration: true, storage: diskStorage<{ loaded: boolean }>(),
    merge: persisted => { if (mergeFails) throw new Error('hydration rejected'); return { loaded: !!persisted }; },
  }));
}

async function withFetch(fetch: typeof globalThis.fetch, run: () => Promise<void>) {
  const originalFetch = globalThis.fetch;
  installWorkspace(emptyWorkspace()); pauseDiskWrites(false);
  globalThis.fetch = fetch;
  try { await run(); }
  finally { installWorkspace(emptyWorkspace()); pauseDiskWrites(true); globalThis.fetch = originalFetch; }
}

const forbiddenReads = {
  chats: async () => { throw new Error('disk startup must not read legacy chats'); },
  store: () => { throw new Error('disk startup must not read localStorage'); },
  assets: async () => { throw new Error('disk startup must not read legacy assets'); },
};

test('saved disk workspace dominates legacy data and hydrates the actual chat store without migration', async () => {
  const workspace = { ...emptyWorkspace(), revision: 7, migrated: true };
  workspace.stores['app-chats'] = { version: 5, state: { conversations: [durableChat('disk-chat')] } };
  const server = localServer(workspace);
  await withFetch(server.fetch, async () => {
    useChatStore.setState({ conversations: [] });
    await initializeWorkspace([useChatStore], forbiddenReads);
    assert.equal(useChatStore.persist.hasHydrated(), true);
    assert.deepEqual(useChatStore.getState().conversations.map(chat => chat.id), ['disk-chat']);
    assert.equal(useChatStore.getState().conversations[0]._abortController, null);
    assert.deepEqual(currentWorkspace(), workspace);
    assert.deepEqual(server.calls, ['GET workspace']);
    assert.equal(server.saves, 0);
  });
});

test('missing workspace migrates allowed records and exact owned bytes once before real persist hydration', async () => {
  const legacy = legacyFixture(); const originals = structuredClone({ chats: legacy.chats, local: legacy.local, assets: legacy.assets });
  const server = localServer(); const store = hydrationStore();
  await withFetch(server.fetch, async () => {
    await initializeWorkspace([store], legacy.adapters);
    assert.equal(store.persist.hasHydrated(), true); assert.equal(store.getState().loaded, true);
    assert.deepEqual(legacy.reads, ['app-chats', 'app-folders', 'app-app-chat', 'app-ui', 'assets']);
    const workspace = server.saved!;
    assert.equal(workspace.migrated, true);
    assert.deepEqual(Object.keys(workspace.assets), ['original-image']);
    assert.deepEqual(server.uploads.get('original-image'), legacy.bytes);
    assert.deepEqual(server.calls, ['GET workspace', 'PUT assets/original-image', 'PUT workspace']);
    assert.deepEqual(workspace.stores['app-app-chat']?.state, { autoTitleChat: false, showSystemMessages: true });
    assert.deepEqual(workspace.stores['app-ui']?.state, { enterIsNewline: true, contentScaling: 1.2 });
    assert.equal(workspace.stores['app-folders']?.version, 1);
    assert.deepEqual((workspace.stores['app-folders']!.state.folders as object[])[0], { id: 'project', title: 'Legacy project', conversationIds: ['legacy-chat'], instructions: '', fileIds: [], revision: 0 });
    assert.deepEqual((workspace.stores['app-chats']!.state.conversations as { id: string }[]).map(chat => chat.id), ['legacy-chat']);
    assert.equal(JSON.stringify(workspace).includes('fixture-secret'), false);
    assert.equal(JSON.stringify(workspace).includes('_abortController'), false);
    assert.equal(workspace.stores['app-personal-settings'], undefined);
    assert.deepEqual({ chats: legacy.chats, local: legacy.local, assets: legacy.assets }, originals);
    await initializeWorkspace([hydrationStore()], forbiddenReads);
    assert.equal(server.saves, 1);
  });
});

test('first migration save failure preserves originals, never hydrates and retries migration successfully', async () => {
  const legacy = legacyFixture(); const originals = structuredClone({ chats: legacy.chats, local: legacy.local, assets: legacy.assets });
  const server = localServer(); server.failSave('Disk is full'); const store = hydrationStore();
  await withFetch(server.fetch, async () => {
    await assert.rejects(initializeWorkspace([store], legacy.adapters), error => error instanceof LocalStorageHTTPError && error.status === 503 && error.message === 'Disk is full');
    assert.equal(server.saved, undefined); assert.equal(store.persist.hasHydrated(), false);
    assert.equal(currentWorkspace().migrated, false);
    assert.deepEqual({ chats: legacy.chats, local: legacy.local, assets: legacy.assets }, originals);
    server.failSave();
    await initializeWorkspace([store], legacy.adapters);
    assert.equal(store.persist.hasHydrated(), true); assert.equal(server.saves, 2);
    assert.deepEqual(server.uploads.get('original-image'), legacy.bytes);
    assert.deepEqual({ chats: legacy.chats, local: legacy.local, assets: legacy.assets }, originals);
  });
});

test('missing referenced legacy original fails distinctly without uploading, saving, installing or hydrating', async () => {
  const legacy = legacyFixture(); legacy.assets.splice(0, 1); const server = localServer(); const store = hydrationStore();
  await withFetch(server.fetch, async () => {
    await assert.rejects(initializeWorkspace([store], legacy.adapters), /Referenced asset original-image is missing from the browser cache. Originals were preserved./);
    assert.deepEqual(server.calls, ['GET workspace']); assert.equal(store.persist.hasHydrated(), false);
    assert.deepEqual(currentWorkspace(), emptyWorkspace()); assert.equal(server.saved, undefined);
  });
});

test('failed asset transfer prevents first workspace save and hydration while preserving legacy originals', async () => {
  const legacy = legacyFixture(); const originals = structuredClone(legacy.assets); const server = localServer(); server.failAsset('Asset volume unavailable'); const store = hydrationStore();
  await withFetch(server.fetch, async () => {
    await assert.rejects(initializeWorkspace([store], legacy.adapters), /Asset volume unavailable/);
    assert.deepEqual(server.calls, ['GET workspace', 'PUT assets/original-image']);
    assert.equal(server.saved, undefined); assert.equal(store.persist.hasHydrated(), false); assert.deepEqual(legacy.assets, originals);
    server.failAsset(); await initializeWorkspace([store], legacy.adapters);
    assert.equal(server.saves, 1); assert.deepEqual(server.uploads.get('original-image'), legacy.bytes);
  });
});

test('corrupt primary workspace enters recovery without legacy fallback or default overwrite', async () => {
  const store = hydrationStore(); const calls: string[] = [];
  await withFetch(async (url, init) => { calls.push(`${init?.method ?? 'GET'} ${String(url)}`); return Response.json({ workspace: { ...emptyWorkspace(), formatVersion: 99 } }); }, async () => {
    await assert.rejects(initializeWorkspace([store], forbiddenReads), /formatVersion/);
    assert.deepEqual(calls, ['GET /api/local/workspace']); assert.equal(store.persist.hasHydrated(), false);
    assert.deepEqual(currentWorkspace(), emptyWorkspace());
  });
});

test('workspace transport and server errors do not become missing-workspace migrations', async () => {
  for (const fetch of [async () => { throw new TypeError('Connection refused'); }, async () => Response.json({ error: 'Corrupt primary save' }, { status: 500 })]) {
    const store = hydrationStore(); let calls = 0;
    await withFetch(async () => { calls++; return fetch(); }, async () => {
      await assert.rejects(initializeWorkspace([store], forbiddenReads), /Connection refused|Corrupt primary save/);
      assert.equal(calls, 1); assert.equal(store.persist.hasHydrated(), false); assert.deepEqual(currentWorkspace(), emptyWorkspace());
    });
  }
});

test('swallowed Zustand hydration failure never completes startup or hydrates later stores', async () => {
  const server = localServer({ ...emptyWorkspace(), migrated: true });
  const broken = hydrationStore('app-chats', 5, true); const later = hydrationStore(); let ready = false;
  await withFetch(server.fetch, async () => {
    await assert.rejects(initializeWorkspace([broken, later], forbiddenReads).then(() => { ready = true; }), /Workspace store could not be loaded/);
    assert.equal(ready, false); assert.equal(broken.persist.hasHydrated(), false); assert.equal(later.persist.hasHydrated(), false);
    assert.deepEqual(server.calls, ['GET workspace']);
  });
});

test('string-encoded legacy v3 chats normalize through startup before saving without changing the source', async () => {
  const chat = durableChat('v3-chat');
  const raw = JSON.stringify({ version: 3, state: { conversations: [{ ...chat, _abortController: null, messages: [{ ...chat.messages[0], fragments: undefined, text: 'Original v3 text' }] }] } });
  const server = localServer(); const store = hydrationStore(); let reads = 0;
  await withFetch(server.fetch, async () => {
    await initializeWorkspace([store], { chats: async () => { reads++; return raw; }, store: () => null, assets: async () => [] });
    const saved = server.saved!;
    assert.equal(saved.stores['app-chats']?.version, 5);
    const conversation = (saved.stores['app-chats']!.state.conversations as typeof chat[])[0];
    assert.deepEqual('part' in conversation.messages[0].fragments[0] ? conversation.messages[0].fragments[0].part : undefined, { pt: 'text', text: 'Original v3 text' });
    assert.equal(JSON.parse(raw).state.conversations[0].messages[0].fragments, undefined);
    assert.equal(JSON.parse(raw).state.conversations[0].messages[0].text, 'Original v3 text');
    assert.equal(reads, 1); assert.equal(store.persist.hasHydrated(), true);
  });
});

test('brand new workspace commits its empty durable envelope once before hydration', async () => {
  const server = localServer(); const store = hydrationStore();
  await withFetch(server.fetch, async () => {
    await initializeWorkspace([store], { chats: async () => undefined, store: () => null, assets: async () => [] });
    assert.deepEqual(server.saved?.stores['app-chats'], { version: 5, state: { conversations: [] } });
    assert.equal(server.saved?.migrated, true); assert.equal(store.persist.hasHydrated(), true);
    assert.deepEqual(server.calls, ['GET workspace', 'PUT workspace']);
    await initializeWorkspace([hydrationStore()], forbiddenReads);
    assert.equal(server.saves, 1);
  });
});
