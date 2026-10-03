import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveArtifact, cachedArtifactBlob, cachedArtifactId, legacyCachedArtifact } from './artifact-cache';
import type { ArtifactReference, ArtifactSource } from './artifact-schema';
import { currentWorkspace, diskStorage, flushDisk, installWorkspace, pauseDiskWrites } from './disk-storage';
import { emptyWorkspace, validateWorkspace, workspaceAssetIds } from './workspace-schema';
import { eligibleNativeHistory, nativeHistoryProjection } from './native-history';
import { createDConversation } from '~/common/stores/chat/chat.conversation';
import { createDMessageFromFragments } from '~/common/stores/chat/chat.message';
import { createHostedResourceContentFragment, duplicateDMessageFragments } from '~/common/stores/chat/chat.fragments';
import { backupWorkspace, commitWorkspace, loadWorkspace, restoreWorkspace, writeAsset } from '~/server/local/workspace';

const source: ArtifactSource = { provider: 'anthropic', deployment: 'gateway-a', fileId: 'same-file' };
function fixture() {
  const { _abortController, ...chat } = createDConversation();
  chat.messages = [createDMessageFromFragments('assistant', [createHostedResourceContentFragment({ via: 'anthropic', fileId: source.fileId })])];
  return chat;
}
function harness() {
  const bytes = new Map<string, Uint8Array>(); let revision = 0;
  const fetcher: typeof fetch = async (url, init) => {
    const id = String(url).split('/').at(-1)!;
    if (String(url).includes('/assets/')) {
      if (init?.method === 'PUT') { bytes.set(id, new Uint8Array(init.body as Uint8Array)); return Response.json({ saved: true }); }
      const content = bytes.get(id); return content ? new Response(new Uint8Array(content)) : Response.json({ error: 'gone' }, { status: 404 });
    }
    const body = JSON.parse(String(init?.body)); validateWorkspace(body.workspace);
    return Response.json({ workspace: { ...body.workspace, revision: ++revision } });
  };
  return { bytes, fetcher };
}
function attachTo(chat: ReturnType<typeof fixture>) {
  return (artifact: ArtifactReference) => {
    const f = chat.messages[0].fragments[0]; if (f.ft === '_ft_sentinel') throw new Error('Unexpected sentinel');
    chat.messages[0].fragments[0] = { ...f, artifact };
    diskStorage().setItem('app-chats', { version: 5, state: { conversations: [chat] } });
    return () => chat.messages[0].fragments.some(f => f.ft === 'content' && f.artifact?.assetId === artifact.assetId);
  };
}

test('original survives display-only preview, native replay, branching, reload and ZIP restore', async () => {
  const oldFetch = globalThis.fetch; const h = harness(); globalThis.fetch = h.fetcher;
  installWorkspace(emptyWorkspace()); pauseDiskWrites(false);
  try {
    const chat = fixture(); const originalPart = structuredClone(chat.messages[0].fragments[0]);
    const projection = nativeHistoryProjection(chat.messages[0].fragments);
    const native = { provider: 'anthropic-messages' as const, deployment: source.deployment, model: chat.chatConfig.llmId, projection, segments: [{ id: 'native', content: [{ type: 'text', text: 'Original' }] }] };
    chat.messages[0].generator = { mgt: 'named', name: 'Claude', nativeHistory: native };
    const original = new Uint8Array([0, 255, 128, 13, 10, 195, 169]);
    const attach = attachTo(chat);
    const ref = await saveArtifact(source, 'generated.png', new Blob([original], { type: 'image/png' }), attach);
    assert.deepEqual(h.bytes.get(ref.assetId), original);
    attach({ ...ref, previewText: 'Display preview only' }); await flushDisk();
    assert.equal(nativeHistoryProjection(chat.messages[0].fragments), projection);
    assert.ok(eligibleNativeHistory(native, chat.messages[0].fragments));
    assert.deepEqual('part' in chat.messages[0].fragments[0] && chat.messages[0].fragments[0].part, 'part' in originalPart && originalPart.part);
    const branched = duplicateDMessageFragments(chat.messages[0].fragments, false);
    assert.equal('artifact' in branched[0] && branched[0].artifact?.assetId, ref.assetId);
    const snapshot = validateWorkspace(currentWorkspace());
    installWorkspace(snapshot); assert.deepEqual(new Uint8Array(await (await cachedArtifactBlob(ref))!.arrayBuffer()), original);
    const directory = await mkdtemp(join(tmpdir(), 'sector7-artifact-'));
    await writeAsset(ref.assetId, original, directory); await commitWorkspace(snapshot, 0, directory);
    const target = await mkdtemp(join(tmpdir(), 'sector7-artifact-restored-'));
    await restoreWorkspace(await backupWorkspace(directory), 0, target);
    assert.deepEqual(await readFile(join(target, 'assets', ref.assetId)), Buffer.from(original));
    assert.ok(workspaceAssetIds((await loadWorkspace(target)).workspace!).has(ref.assetId));
  } finally { globalThis.fetch = oldFetch; pauseDiskWrites(true); }
});

test('dedupe scopes file IDs to provider, deployment and container', async () => {
  const oldFetch = globalThis.fetch; const h = harness(); globalThis.fetch = h.fetcher;
  installWorkspace(emptyWorkspace()); pauseDiskWrites(false);
  try {
    const chat = fixture(); const owners: ArtifactReference[] = [];
    const attach = (artifact: ArtifactReference) => {
      owners.push(artifact);
      chat.messages[0].fragments.push({ ...createHostedResourceContentFragment({ via: 'anthropic', fileId: source.fileId }), artifact });
      diskStorage().setItem('app-chats', { version: 5, state: { conversations: [chat] } });
      return () => true;
    };
    const sources: ArtifactSource[] = [source, { ...source, deployment: 'gateway-b' }, { ...source, provider: 'openai-container', containerId: 'one' }, { ...source, provider: 'openai-container', containerId: 'two' }];
    for (const s of sources) await saveArtifact(s, 'file.txt', new Blob(['original'], { type: 'text/plain' }), attach);
    assert.equal(new Set(owners.map(r => r.assetId)).size, 4);
    assert.deepEqual(sources.map(cachedArtifactId), owners.map(r => r.assetId));
    await saveArtifact(source, 'file.txt', new Blob(['original'], { type: 'text/plain' }), attach);
    assert.equal(owners.at(-1)?.assetId, owners[0].assetId); assert.equal(h.bytes.size, 4);
    await assert.rejects(cachedArtifactBlob({ ...owners[0], source: sources[1] }), /source/);
  } finally { globalThis.fetch = oldFetch; pauseDiskWrites(true); }
});

test('failed original save does not authorize later preview or delete; retry preserves exact bytes', async () => {
  const oldFetch = globalThis.fetch; const h = harness(); installWorkspace(emptyWorkspace()); pauseDiskWrites(false);
  const chat = fixture(); let acted = false;
  try {
    globalThis.fetch = async () => Response.json({ error: 'disk full' }, { status: 507 });
    await assert.rejects(async () => { await saveArtifact(source, 'file.txt', new Blob(['original']), attachTo(chat)); acted = true; }, /disk full/);
    assert.equal(acted, false); assert.equal(cachedArtifactId(source), undefined);
    globalThis.fetch = h.fetcher; await flushDisk();
    const ref = 'artifact' in chat.messages[0].fragments[0] && chat.messages[0].fragments[0].artifact;
    assert.ok(ref); assert.equal(await (await cachedArtifactBlob(ref))?.text(), 'original');
  } finally { globalThis.fetch = oldFetch; pauseDiskWrites(true); }
});

test('unowned downloaded bytes cannot authorize a destructive action', async () => {
  const oldFetch = globalThis.fetch; globalThis.fetch = harness().fetcher; installWorkspace(emptyWorkspace()); pauseDiskWrites(false);
  try { await assert.rejects(saveArtifact(source, 'file.txt', new Blob(['original']), () => () => false), /no longer owned/); }
  finally { globalThis.fetch = oldFetch; pauseDiskWrites(true); }
});

test('legacy local original remains readable after expiry without claiming a modern deployment', async () => {
  const oldFetch = globalThis.fetch; const h = harness(); globalThis.fetch = h.fetcher;
  pauseDiskWrites(false);
  try {
    const chat = fixture(); const workspace = emptyWorkspace();
    workspace.stores['app-chats'] = { version: 5, state: { conversations: [chat] } };
    workspace.assets.legacy = { size: 3, mime: 'application/octet-stream', metadata: { upstreamFileId: source.fileId, metadata: { fileName: 'old.txt', mimeType: 'text/plain' } } };
    h.bytes.set('legacy', new Uint8Array([65, 66, 67])); installWorkspace(workspace);
    const ref = legacyCachedArtifact(source.fileId); assert.ok(ref);
    attachTo(chat)(ref); await flushDisk();
    assert.equal(await (await cachedArtifactBlob(ref))!.text(), 'ABC');
    assert.equal(cachedArtifactId(source), undefined);
    assert.equal(ref.source.deployment, 'legacy-unscoped');
    assert.equal(nativeHistoryProjection(chat.messages[0].fragments), nativeHistoryProjection(fixture().messages[0].fragments));
  } finally { globalThis.fetch = oldFetch; pauseDiskWrites(true); }
});

test('metadata-only handler rejects pending streams and preserves current settled fragment', async () => {
  const { ConversationHandler } = await import('~/common/chat-overlay/ConversationHandler');
  const { useChatStore, getConversation } = await import('~/common/stores/chat/store-chats');
  pauseDiskWrites(true); installWorkspace(emptyWorkspace());
  const chat = { ...fixture(), _abortController: null };
  chat.messages[0].pendingIncomplete = true;
  const f = chat.messages[0].fragments[0]; if (f.ft === '_ft_sentinel') throw new Error('Unexpected sentinel');
  const ref: ArtifactReference = { assetId: 'owned', source, fileName: 'file.txt', mimeType: 'text/plain' };
  useChatStore.setState({ conversations: [chat] });
  const handler = new ConversationHandler(chat.id);
  useChatStore.getState().editMessage(chat.id, chat.messages[0].id, current => ({ fragments: current.fragments.map(fragment => ({ ...fragment, originId: 'newer-metadata' })) }), false, false);
  assert.throws(() => handler.messageArtifactSave(chat.messages[0].id, f.fId, ref), /finish/);
  useChatStore.getState().editMessage(chat.id, chat.messages[0].id, { pendingIncomplete: false }, true, false);
  const owned = handler.messageArtifactSave(chat.messages[0].id, f.fId, ref);
  assert.ok(owned());
  const current = getConversation(chat.id)!.messages[0];
  assert.equal(!!current.pendingIncomplete, false);
  assert.equal('originId' in current.fragments[0] && current.fragments[0].originId, 'newer-metadata');
  assert.equal('artifact' in current.fragments[0] && current.fragments[0].artifact?.assetId, ref.assetId);
  assert.equal(nativeHistoryProjection(current.fragments), nativeHistoryProjection(chat.messages[0].fragments));
  useChatStore.getState().deleteMessageFragment(chat.id, chat.messages[0].id, f.fId, false, false);
  assert.equal(owned(), false);
  assert.throws(() => handler.messageArtifactSave(chat.messages[0].id, f.fId, ref), /changed/);
});

test('unrelated opaque artifact metadata does not become a durable file reference', () => {
  const workspace = emptyWorkspace(); const chat = fixture();
  const f = chat.messages[0].fragments[0]; if (f.ft === '_ft_sentinel') throw new Error('sentinel');
  f.vendorState = { opaque: { artifact: { providerOwned: true } } };
  workspace.stores['app-chats'] = { version: 5, state: { conversations: [chat] } };
  assert.doesNotThrow(() => validateWorkspace(workspace)); assert.equal(workspaceAssetIds(workspace).size, 0);
});
test('dedupe shared by another owner cannot authorize a no-op attachment', async () => {
  const oldFetch = globalThis.fetch; globalThis.fetch = harness().fetcher; installWorkspace(emptyWorkspace()); pauseDiskWrites(false);
  try {
    const chat = fixture(); await saveArtifact(source, 'file.txt', new Blob(['original']), attachTo(chat));
    await assert.rejects(saveArtifact(source, 'file.txt', new Blob(['original']), () => () => false), /no longer owned/);
  } finally { globalThis.fetch = oldFetch; pauseDiskWrites(true); }
});
