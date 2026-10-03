import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attentionLabel, canMarkSeen, questionSchema } from './attention';
test('attention precedence preserves unanswered questions after viewing', () => {
  const attention = { lastOutcome: 'error' as const, lastCompletedMessageId: 'reply', pendingQuestions: [{ invocationId: 'q', messageId: 'reply', model: 'claude-opus-5-5', questions: [{ id: 'one', text: 'Choose' }] }] };
  assert.equal(attentionLabel(attention, 'Thinking'), 'Thinking'); assert.equal(attentionLabel(attention), 'Needs your answer');
  assert.equal(attentionLabel({ lastCompletedMessageId: 'reply', lastSeenMessageId: 'earlier' }), 'Unread');
});
test('seen requires visible message end and focused visible document', () => {
  assert.equal(canMarkSeen(true, true, true), true);
  assert.equal(canMarkSeen(false, true, true), false); assert.equal(canMarkSeen(true, false, true), false); assert.equal(canMarkSeen(true, true, false), false);
});
test('question schema rejects duplicates and bounds questions and choices', () => {
  assert.equal(questionSchema.safeParse({ questions: [{ id: 'a', text: 'A' }] }).success, true);
  assert.equal(questionSchema.safeParse({ questions: [{ id: 'a', text: 'A' }, { id: 'a', text: 'B' }] }).success, false);
  assert.equal(questionSchema.safeParse({ questions: [] }).success, false);
});

test('question calls parse completely and preserve invocation IDs', async () => {
  const { questionInvocations } = await import('./attention');
  const { createDMessageFromFragments } = await import('~/common/stores/chat/chat.message');
  const { create_FunctionCallInvocation_ContentFragment } = await import('~/common/stores/chat/chat.fragments');
  const message = createDMessageFromFragments('assistant', [create_FunctionCallInvocation_ContentFragment('q_1', 'ask_user_question', '{"questions":[{"id":"a","text":"Choose"}]}')]);
  assert.equal(questionInvocations(message, 'claude-opus-5-5')[0].invocationId, 'q_1');
  message.fragments = [create_FunctionCallInvocation_ContentFragment('q_1', 'ask_user_question', '{')];
  assert.throws(() => questionInvocations(message, 'claude-opus-5-5'), /incomplete/);
});
