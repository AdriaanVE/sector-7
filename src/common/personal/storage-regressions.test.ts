import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorkspace, normalizeWorkspace, validateWorkspace } from './workspace-schema';
import { currentWorkspace, diskStorage, flushDisk, installWorkspace, persistAsset, pauseDiskWrites } from './disk-storage';
import { useChatStore, getConversation } from '~/common/stores/chat/store-chats';
import { createDConversation } from '~/common/stores/chat/chat.conversation';
import { createDMessageFromFragments, createDMessageTextContent } from '~/common/stores/chat/chat.message';
import { create_FunctionCallInvocation_ContentFragment } from '~/common/stores/chat/chat.fragments';
import { answerQuestions, assertNoPendingQuestion, continueQuestions, questionAnswerKey } from './questions';

function durableChat() { const { _abortController, ...chat } = createDConversation(); return chat; }
function successfulFetch() { let revision = 0; return async (_url: string | URL | Request, init?: RequestInit) => {
  if (String(_url).includes('/assets/')) return Response.json({ saved: true });
  const body = JSON.parse(String(init?.body)); validateWorkspace(body.workspace); return Response.json({ workspace: { ...body.workspace, revision: ++revision } });
}; }

test('actual chat hydration cannot mutate disk envelope; settings-only save stays valid', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = successfulFetch();
  try {
    const workspace = emptyWorkspace(); const chat = durableChat();
    workspace.stores['app-chats'] = { version: 5, state: { conversations: [chat] } };
    useChatStore.setState({ conversations: [] }); installWorkspace(workspace); await useChatStore.persist.rehydrate();
    assert.ok(useChatStore.persist.hasHydrated()); assert.equal(getConversation(chat.id)?._abortController, null);
    assert.equal('_abortController' in (currentWorkspace().stores['app-chats']!.state.conversations as object[])[0], false);
    await useChatStore.persist.rehydrate(); assert.equal(useChatStore.getState().conversations.length, 1);
    const settings = { version: 1, state: { instructions: 'Hello' } };
    diskStorage().setItem('app-personal-settings', settings); settings.state.instructions = 'mutated';
    await flushDisk(); assert.equal(currentWorkspace().stores['app-personal-settings']?.state.instructions, 'Hello');
  } finally { globalThis.fetch = originalFetch; }
});

test('v3 browser normalization precedes fragment scanning and keeps originals unchanged', () => {
  const workspace = emptyWorkspace(); const chat = durableChat();
  const legacy = { ...chat, messages: [{ ...createDMessageTextContent('user', 'Old'), fragments: undefined, text: 'Old' }] };
  workspace.stores['app-chats'] = { version: 3, state: { conversations: [legacy] } };
  const normalized = normalizeWorkspace(workspace);
  assert.equal(normalized.stores['app-chats']?.version, 5);
  assert.equal(((normalized.stores['app-chats']?.state.conversations as typeof chat[])[0].messages[0].fragments[0] as { part: { text: string } }).part.text, 'Old');
  validateWorkspace(normalized); assert.equal(legacy.messages[0].fragments, undefined);
  assert.deepEqual(normalizeWorkspace(normalized), normalized);
});

test('canonical AIX model survives normalization and legacy converter import', async () => {
  const { V3StoreDataToHead, V4ToHeadConverters } = await import('~/common/stores/chat/chats.converters');
  const chat = createDConversation(); const m = createDMessageTextContent('assistant', 'Hello');
  m.generator = { mgt: 'aix', name: 'sonnet-5-5', aix: { vId: 'anthropic', mId: 'claude-sonnet-5-5' } };
  chat.messages = [m]; delete (chat as Partial<typeof chat>).chatConfig;
  V4ToHeadConverters.inMemHeadCleanDConversations([chat]); assert.equal(chat.chatConfig.llmId, 'claude-sonnet-5-5');
  const imported = V3StoreDataToHead.recreateConversation({ ...chat, chatConfig: undefined });
  assert.equal(imported.chatConfig.llmId, 'claude-sonnet-5-5');
});

test('cache-only draft bytes stay outside saves until a durable message owns them', async () => {
  const originalFetch = globalThis.fetch; const uploads: string[] = [];
  const delegate = successfulFetch(); globalThis.fetch = async (url, init) => { if (String(url).includes('/assets/')) uploads.push(String(url)); return delegate(url, init); };
  try {
    installWorkspace(emptyWorkspace());
    await persistAsset({ id: 'draft', data: { mimeType: 'image/png', base64: 'AQID' }, cache: {}, scopeId: 'attachment-drafts' });
    await flushDisk(); assert.equal(uploads.length, 0); assert.deepEqual(currentWorkspace().assets, {});
    const chat = durableChat(); chat.messages = [createDMessageFromFragments('user', [{ ft: 'content', fId: 'image', part: { pt: 'image_ref', dataRef: { reftype: 'dblob', dblobAssetId: 'draft', mimeType: 'image/png', bytesSize: 3 } } }])];
    diskStorage().setItem('app-chats', { version: 5, state: { conversations: [chat] } }); await flushDisk();
    assert.equal(uploads.length, 1); assert.equal(currentWorkspace().assets.draft.size, 3);
  } finally { globalThis.fetch = originalFetch; }
});

test('actual answer save blocks both entry points and rollback keeps competing messages', async () => {
  const originalFetch = globalThis.fetch; pauseDiskWrites(false); installWorkspace(emptyWorkspace());
  const chat = createDConversation();
  chat.messages = [createDMessageFromFragments('assistant', ['one', 'two'].map(id => create_FunctionCallInvocation_ContentFragment(id, 'ask_user_question', JSON.stringify({ questions: [{ id: 'q1', text: id }] }))))];
  chat.pendingQuestions = ['one', 'two'].map(id => ({ invocationId: id, messageId: chat.messages[0].id, model: chat.chatConfig.llmId, questions: [{ id: 'q1', text: id }] }));
  useChatStore.setState({ conversations: [chat] });
  let rejectSave!: (error: Error) => void; let entered!: () => void;
  const enteredPromise = new Promise<void>(resolve => entered = resolve);
  globalThis.fetch = async () => { entered(); return await new Promise<Response>((_resolve, reject) => rejectSave = reject); };
  try {
    const saving = answerQuestions(chat.id, { [questionAnswerKey('one', 'q1')]: 'A', [questionAnswerKey('two', 'q1')]: 'B' });
    await enteredPromise;
    assert.throws(() => assertNoPendingQuestion(chat.id), /Wait/);
    assert.equal(await answerQuestions(chat.id, {}), false);
    assert.equal(await continueQuestions(chat.id, async () => { throw new Error('must not generate'); }), false);
    const responses = getConversation(chat.id)!.messages[0].fragments.filter(f => 'part' in f && f.part.pt === 'tool_response');
    assert.deepEqual(responses.map(f => 'part' in f && f.part.pt === 'tool_response' && JSON.parse(f.part.response.result).answers.q1), ['A', 'B']);
    const concurrent = createDMessageTextContent('user', 'Keep me');
    useChatStore.getState()._editConversation(chat.id, current => ({ messages: [...current.messages, concurrent] }));
    rejectSave(new Error('save rejected')); await assert.rejects(saving, /save rejected/);
    assert.equal(getConversation(chat.id)!.messages.at(-1)?.id, concurrent.id);
    assert.equal(getConversation(chat.id)!.messages[0].fragments.filter(f => 'part' in f && f.part.pt === 'tool_response').length, 0);
    assert.ok(getConversation(chat.id)!.pendingQuestions!.every(q => !q.answered));
    let confirm!: (response: Response) => void; let savingEntered!: () => void;
    const started = new Promise<void>(resolve => savingEntered = resolve);
    globalThis.fetch = async () => { savingEntered(); return await new Promise<Response>(resolve => confirm = resolve); };
    const retry = answerQuestions(chat.id, { [questionAnswerKey('one', 'q1')]: 'A', [questionAnswerKey('two', 'q1')]: 'B' });
    await started;
    useChatStore.getState()._editConversation(chat.id, current => ({ messages: [...current.messages, createDMessageTextContent('user', 'Later')] }));
    confirm(Response.json({ workspace: { revision: 1 } }));
    assert.equal(await retry, true);
    globalThis.fetch = async () => { throw new Error('later unrelated save failed'); };
    await assert.rejects(flushDisk(), /later unrelated/);
    assert.ok(getConversation(chat.id)!.pendingQuestions!.every(q => q.answered));
    globalThis.fetch = successfulFetch(); await flushDisk();
    let finish!: () => void; const continuing = continueQuestions(chat.id, async () => { await new Promise<void>(resolve => finish = resolve); return true; });
    assert.equal(await continueQuestions(chat.id, async () => true), false); finish(); assert.equal(await continuing, true);
  } finally { globalThis.fetch = originalFetch; pauseDiskWrites(true); }
});


test('v4 legacy document rename validates detached import without losing contents', async () => {
  const workspace = emptyWorkspace(); const chat = durableChat();
  const legacyPart = { pt: 'doc', type: 'text/plain', data: { idt: 'text', text: 'Original document contents' }, ref: 'legacy.txt', l1Title: 'Legacy', extra: { original: true } };
  const message = createDMessageTextContent('user', 'Read this');
  const legacy = { ...message, fragments: [{ ft: 'attachment', fId: 'legacy-doc', part: legacyPart }] };
  workspace.stores['app-chats'] = { version: 4, state: { conversations: [{ ...chat, messages: [legacy] }] } };
  const original = structuredClone(workspace);
  const normalized = validateWorkspace(workspace);
  const stored = (normalized.stores['app-chats']!.state.conversations as typeof chat[])[0].messages[0];
  assert.deepEqual('part' in stored.fragments[0] ? stored.fragments[0].part : undefined, { pt: 'doc', vdt: 'text/plain', data: legacyPart.data, ref: legacyPart.ref, l1Title: legacyPart.l1Title, extra: legacyPart.extra });
  assert.deepEqual(workspace, original);
  assert.deepEqual(validateWorkspace(normalized), normalized);
  const { V4ToHeadConverters } = await import('~/common/stores/chat/chats.converters');
  V4ToHeadConverters.inMemHeadCleanDConversations([structuredClone({ ...chat, _abortController: null, messages: [stored] })]);
  const canonical = structuredClone(normalized);
  assert.deepEqual(validateWorkspace(canonical), normalized);
});
