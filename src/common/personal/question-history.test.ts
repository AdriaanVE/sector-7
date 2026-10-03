import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDConversation } from '~/common/stores/chat/chat.conversation';
import { createDMessageFromFragments, createDMessageTextContent } from '~/common/stores/chat/chat.message';
import { create_FunctionCallInvocation_ContentFragment, create_FunctionCallResponse_ContentFragment } from '~/common/stores/chat/chat.fragments';
import { DataAtRestV1, V4ToHeadConverters } from '~/common/stores/chat/chats.converters';
import { getConversation, useChatStore } from '~/common/stores/chat/store-chats';
import { emptyWorkspace } from './workspace-schema';
import { currentWorkspace, installWorkspace } from './disk-storage';
import { nativeHistoryProjection } from './native-history';
import { normalizeQuestionHistory } from './question-history';

function questionChat(answer?: 'saved' | 'dismissed' | 'error' | 'malformed') {
  const chat = createDConversation();
  const input = { questions: [{ id: 'choice', text: 'Choose', choices: ['A', 'B'] }] };
  const message = createDMessageFromFragments('assistant', [create_FunctionCallInvocation_ContentFragment('question-1', 'ask_user_question', JSON.stringify(input))]);
  message.generator = { mgt: 'aix', name: 'Claude', aix: { vId: 'anthropic', mId: 'claude-sonnet-5-5' }, nativeHistory: {
    provider: 'anthropic-messages', deployment: 'test', model: 'claude-sonnet-5-5', projection: nativeHistoryProjection(message.fragments), requestPrefix: 'unchanged',
    segments: [{ id: 'segment', content: [{ type: 'redacted_thinking', data: 'opaque bytes' }, { type: 'tool_use', id: 'question-1', name: 'ask_user_question', input }] }],
  } };
  if (answer) message.fragments.push(create_FunctionCallResponse_ContentFragment('question-1', answer === 'dismissed' || answer === 'error' ? answer : false, 'ask_user_question',
    JSON.stringify(answer === 'saved' ? { answers: { choice: 'A' } } : answer === 'malformed' ? { answers: {} } : { [answer]: true }), 'client'));
  chat.messages = [createDMessageTextContent('user', 'Help'), message];
  chat.lastCompletedMessageId = message.id;
  chat.lastSeenMessageId = message.id;
  chat.lastOutcome = 'ok';
  return chat;
}

for (const answer of [undefined, 'saved', 'dismissed', 'error', 'malformed'] as const) test(`current JSON converter and actual store import preserve ${answer ?? 'unanswered'} question state`, () => {
  installWorkspace(emptyWorkspace());
  useChatStore.setState({ conversations: [] });
  const chat = questionChat(answer);
  const history = structuredClone(chat.messages);
  const exported = JSON.parse(JSON.stringify(DataAtRestV1.formatChatToJsonV1(chat)));
  const imported = DataAtRestV1.recreateConversation(exported)!;
  const id = useChatStore.getState().importConversation(imported, true);
  const stored = getConversation(id)!;
  assert.equal(stored.pendingQuestions?.length, answer === undefined || answer === 'saved' ? 1 : 0);
  if (stored.pendingQuestions?.length) {
    assert.equal(stored.pendingQuestions[0].answered, answer === 'saved' ? true : undefined);
    assert.equal(stored.pendingQuestions[0].model, 'claude-sonnet-5-5');
    assert.equal(stored.pendingQuestions[0].messageId, chat.messages[1].id);
    assert.equal(stored.pendingQuestions[0].invocationId, 'question-1');
  }
  assert.equal(stored.lastCompletedMessageId, chat.lastCompletedMessageId);
  assert.equal(stored.lastSeenMessageId, chat.lastSeenMessageId);
  assert.equal(stored.lastOutcome, 'ok');
  assert.deepEqual(stored.messages.map(m => m.fragments), history.map(m => m.fragments));
  assert.deepEqual(stored.messages[1].generator?.nativeHistory, history[1].generator?.nativeHistory);
  const normalized = structuredClone(stored);
  V4ToHeadConverters.inMemHeadCleanDConversations([stored]);
  assert.deepEqual(stored, normalized);
});

test('actual hydration rebuilds saved answer without mutating disk history or starting generation', async () => {
  const chat = questionChat('saved'); delete chat.pendingQuestions;
  const { _abortController, ...durable } = chat;
  const workspace = emptyWorkspace();
  workspace.stores['app-chats'] = { version: 5, state: { conversations: [durable] } };
  useChatStore.setState({ conversations: [] }); installWorkspace(workspace);
  const original = structuredClone(currentWorkspace());
  await useChatStore.persist.rehydrate();
  const stored = getConversation(chat.id)!;
  assert.equal(stored.pendingQuestions?.[0].answered, true);
  assert.equal(stored._abortController, null);
  assert.equal(stored.messages.length, 2);
  assert.deepEqual(currentWorkspace(), original);
  await useChatStore.persist.rehydrate();
  assert.equal(getConversation(chat.id)?.pendingQuestions?.length, 1);
});

test('later assistant messages consume saved answer, including interrupted continuation', () => {
  for (const interrupted of [false, true]) {
    const chat = questionChat('saved');
    const later = createDMessageTextContent('assistant', 'Continuing'); later.pendingIncomplete = interrupted;
    chat.messages.push(later);
    V4ToHeadConverters.inMemHeadCleanDConversations([chat]);
    assert.deepEqual(chat.pendingQuestions, []);
    assert.equal(chat.lastOutcome, interrupted ? 'interrupted' : 'ok');
  }
});

test('stale pending entries and attention anchors are removed without replacing missing history', () => {
  const chat = questionChat(); const message = chat.messages[1];
  chat.pendingQuestions = [{ invocationId: 'missing', messageId: 'missing', model: 'claude-opus-5-5', questions: [{ id: 'q', text: 'stale' }] }];
  chat.messages = []; chat.lastCompletedMessageId = message.id;
  assert.deepEqual(normalizeQuestionHistory(chat), { pendingQuestions: [], lastCompletedMessageId: undefined, lastSeenMessageId: undefined, lastOutcome: undefined });
  assert.deepEqual(chat.messages, []);
});

test('original invocation model survives a changed conversation model and recovers legacy saved identity', () => {
  const chat = questionChat();
  chat.chatConfig.llmId = 'claude-opus-5-5';
  let pending = normalizeQuestionHistory(chat).pendingQuestions!;
  assert.equal(pending[0].model, 'claude-sonnet-5-5');
  chat.pendingQuestions = pending; delete chat.messages[1].generator;
  pending = normalizeQuestionHistory(chat).pendingQuestions!;
  assert.equal(pending[0].model, 'claude-sonnet-5-5');
  chat.pendingQuestions = [];
  assert.throws(() => normalizeQuestionHistory(chat), /model is missing/);
});

test('ambiguous valid question identities reject import rather than permitting unsafe continuation', () => {
  for (const duplicate of ['invocation', 'message', 'response']) {
    const chat = questionChat(duplicate === 'response' ? 'saved' : undefined);
    if (duplicate === 'message') chat.messages.push(structuredClone(chat.messages[1]));
    else chat.messages[1].fragments.push(structuredClone(chat.messages[1].fragments[duplicate === 'response' ? 1 : 0]));
    assert.throws(() => DataAtRestV1.recreateConversation(chat), /ambiguous|duplicate results/);
  }
});

test('invalid calls and incomplete question messages do not become pending or alter provider bytes', () => {
  const chat = questionChat(); chat.messages[1].pendingIncomplete = true;
  delete chat.lastCompletedMessageId;
  const original = structuredClone(chat.messages[1].generator?.nativeHistory);
  V4ToHeadConverters.inMemHeadCleanDConversations([chat]);
  assert.deepEqual(chat.pendingQuestions, []);
  assert.deepEqual(chat.messages[1].generator?.nativeHistory, original);
  V4ToHeadConverters.inMemHeadCleanDConversations([chat]);
  assert.deepEqual(chat.pendingQuestions, []);
  chat.messages[1].fragments = [create_FunctionCallInvocation_ContentFragment('invalid', 'ask_user_question', '{')];
  assert.deepEqual(normalizeQuestionHistory(chat).pendingQuestions, []);
});

test('stale interrupted attention does not suppress a later complete question', () => {
  const chat = questionChat();
  const earlier = createDMessageTextContent('assistant', 'Earlier attempt'); chat.messages.unshift(earlier);
  chat.lastCompletedMessageId = earlier.id; chat.lastSeenMessageId = chat.messages[1].id; chat.lastOutcome = 'interrupted';
  const normalized = normalizeQuestionHistory(chat);
  assert.equal(normalized.pendingQuestions?.length, 1);
  assert.equal(normalized.lastSeenMessageId, undefined);
});

test('malformed attention fields do not discard surviving assistant anchors', () => {
  const chat = questionChat();
  const corrupted = { ...chat, lastSeenMessageId: 12 };
  const normalized = normalizeQuestionHistory(corrupted as unknown as typeof chat);
  assert.equal(normalized.lastCompletedMessageId, chat.lastCompletedMessageId);
  assert.equal(normalized.lastSeenMessageId, undefined);
  assert.equal(normalized.lastOutcome, 'ok');
});

test('rejected ambiguous import preserves an existing chat run', () => {
  installWorkspace(emptyWorkspace());
  const existing = questionChat(); existing._abortController = new AbortController();
  useChatStore.setState({ conversations: [existing] });
  const imported = questionChat(); imported.id = existing.id;
  imported.messages[1].fragments.push(structuredClone(imported.messages[1].fragments[0]));
  assert.throws(() => useChatStore.getState().importConversation(imported, true), /ambiguous/);
  assert.equal(existing._abortController.signal.aborted, false);
  assert.equal(imported.id, existing.id);
  assert.equal(getConversation(existing.id), existing);
});

test('consumed duplicate results cannot block import or reopening the workspace', () => {
  const chat = questionChat('saved');
  chat.messages[1].fragments.push(structuredClone(chat.messages[1].fragments[1]));
  chat.messages.push(createDMessageTextContent('assistant', 'Already continued'));
  const history = structuredClone(chat.messages);
  const imported = DataAtRestV1.recreateConversation(chat)!;
  assert.deepEqual(imported.pendingQuestions, []);
  assert.deepEqual(imported.messages.map(message => message.fragments), history.map(message => message.fragments));
});

test('stopped questions use the same terminal rule at runtime and after disk hydration', async () => {
  const { questionInvocations } = await import('./attention');
  const { validateWorkspace } = await import('./workspace-schema');
  for (const reason of ['client-abort', 'issue', 'filter'] as const) {
    const chat = questionChat();
    chat.messages[1].generator!.tokenStopReason = reason;
    assert.deepEqual(questionInvocations(chat.messages[1], chat.chatConfig.llmId), []);
    const { _abortController, ...durable } = chat;
    const workspace = emptyWorkspace();
    workspace.stores['app-chats'] = { version: 5, state: { conversations: [durable] } };
    validateWorkspace(workspace);
    useChatStore.setState({ conversations: [] }); installWorkspace(workspace);
    await useChatStore.persist.rehydrate();
    assert.deepEqual(getConversation(chat.id)!.pendingQuestions, []);
    assert.deepEqual(getConversation(chat.id)!.messages[1].generator?.nativeHistory, chat.messages[1].generator?.nativeHistory);
  }
});

test('original retired model identities remain metadata and ambiguous actionable disk calls reject before hydration', async () => {
  const { validateWorkspace } = await import('./workspace-schema');
  const chat = questionChat();
  if (chat.messages[1].generator?.mgt !== 'aix') throw new Error('Expected AIX generator');
  chat.messages[1].generator.aix.mId = 'legacy-claude-model';
  assert.equal(normalizeQuestionHistory(chat).pendingQuestions![0].model, 'legacy-claude-model');
  chat.messages[1].fragments.push(structuredClone(chat.messages[1].fragments[0]));
  const { _abortController, ...durable } = chat;
  const workspace = emptyWorkspace();
  workspace.stores['app-chats'] = { version: 5, state: { conversations: [durable] } };
  assert.throws(() => validateWorkspace(workspace), /ambiguous/);
});
