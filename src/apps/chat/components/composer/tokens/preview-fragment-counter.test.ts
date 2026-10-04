import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DLLM } from '~/common/stores/llms/llms.types';
import { estimateTokensForFragments } from '~/common/stores/chat/chat.tokens';
import { createDocAttachmentFragment, createDMessageDataInlineText, createTextContentFragment } from '~/common/stores/chat/chat.fragments';
import { useAppChatStore } from '../../../store-app-chat';
import { createPreviewFragmentCounter } from './preview-fragment-counter';

const model: DLLM = { id: 'test', label: 'Test', created: 0, description: '', hidden: false, contextTokens: 100000, maxOutputTokens: 8192, interfaces: [], parameterSpecs: [], initialParameters: {}, sId: 'test', vId: 'anthropic' };

test('cached full context matches authoritative count while drafts and history change', () => {
  useAppChatStore.setState({ tokenCountingMethod: 'approximate' });
  const cached = createPreviewFragmentCounter(estimateTokensForFragments, 'approximate');
  const history = createTextContentFragment('A long source document '.repeat(1000));
  const count = (text: string) => cached(model, 'user', [history, createTextContentFragment(text)], true, 'test');
  for (const text of ['h', 'he', 'hello']) {
    assert.equal(count(text), estimateTokensForFragments(model, 'user', [history, createTextContentFragment(text)], true, 'test'));
  }
  const before = count('hello');
  if (history.part.pt !== 'text') throw new Error('Expected text');
  history.part.text = 'Revised entirely';
  const after = count('hello');
  assert.notEqual(after, before);
  assert.equal(after, estimateTokensForFragments(model, 'user', [history, createTextContentFragment('hello')], true, 'test'));
  assert.equal(cached(model, 'assistant', [history], true, 'test'), estimateTokensForFragments(model, 'assistant', [history], true, 'test'));
});

test('document text edits invalidate the token preview without replacing the attachment', () => {
  useAppChatStore.setState({ tokenCountingMethod: 'approximate' });
  const cached = createPreviewFragmentCounter(estimateTokensForFragments, 'approximate');
  const document = createDocAttachmentFragment('Source', '', 'text/plain', createDMessageDataInlineText('short', 'text/plain'), 'source.txt', 1);
  const before = cached(model, 'user', [document], true, 'test');
  if (document.part.pt !== 'doc') throw new Error('Expected document');
  document.part.data.text = 'A substantially longer source document. '.repeat(100);
  const after = cached(model, 'user', [document], true, 'test');
  assert.ok(after > before);
  assert.equal(after, estimateTokensForFragments(model, 'user', [document], true, 'test'));
});

test('renaming a document refreshes the token preview for its transmitted title', () => {
  useAppChatStore.setState({ tokenCountingMethod: 'approximate' });
  const cached = createPreviewFragmentCounter(estimateTokensForFragments, 'approximate');
  const document = createDocAttachmentFragment('Source', '', 'text/plain', createDMessageDataInlineText('contents', 'text/plain'), 'a.txt', 1);
  const before = cached(model, 'user', [document], true, 'test');
  if (document.part.pt !== 'doc') throw new Error('Expected document');
  document.part.ref = 'a much longer descriptive document filename.txt';
  const after = cached(model, 'user', [document], true, 'test');
  assert.ok(after > before);
  assert.equal(after, estimateTokensForFragments(model, 'user', [document], true, 'test'));
});

test('the preview respects role-dependent counts when the same fragment changes roles', () => {
  const cached = createPreviewFragmentCounter((_llm, role) => role === 'user' ? 7 : 11);
  const fragment = createTextContentFragment('same text');
  assert.equal(cached(model, 'user', [fragment], true, 'test'), 7);
  assert.equal(cached(model, 'assistant', [fragment], true, 'test'), 11);
  assert.equal(cached(model, 'user', [fragment], true, 'test'), 7);
});

test('previews without top glue retain the uncached combined-fragment count', () => {
  useAppChatStore.setState({ tokenCountingMethod: 'approximate' });
  const cached = createPreviewFragmentCounter(estimateTokensForFragments, 'approximate');
  const fragments = [createTextContentFragment('a'), createTextContentFragment('b')];
  assert.equal(cached(model, 'user', fragments, true, 'test'), 10);
  assert.equal(cached(model, 'user', fragments, false, 'test'), 6);
  assert.equal(cached(model, 'user', fragments, false, 'test'), estimateTokensForFragments(model, 'user', fragments, false, 'test'));
});
