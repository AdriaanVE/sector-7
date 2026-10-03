import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DLLM } from '~/common/stores/llms/llms.types';
import { estimateTokensForFragments } from '~/common/stores/chat/chat.tokens';
import { createTextContentFragment } from '~/common/stores/chat/chat.fragments';
import { useModelsStore } from '~/common/stores/llms/store-llms';
import { useAppChatStore } from '../../../store-app-chat';
import { createPreviewFragmentCounter } from './preview-fragment-counter';

const model: DLLM = { id: 'test', label: 'Test', created: 0, description: '', hidden: false, contextTokens: 100000, maxOutputTokens: 8192, interfaces: [], parameterSpecs: [], initialParameters: {}, sId: 'test', vId: 'anthropic' };

test('cached full context matches authoritative count and reuses unchanged history while drafts change', () => {
  useAppChatStore.setState({ tokenCountingMethod: 'approximate' }); useModelsStore.setState({ llms: [model] });
  let counted = 0;
  const cached = createPreviewFragmentCounter((...args) => { counted++; return estimateTokensForFragments(...args); });
  const history = createTextContentFragment('A long source document '.repeat(1000));
  const count = (text: string) => cached(model, 'user', [history, createTextContentFragment(text)], true, 'test');
  for (const text of ['h', 'he', 'hello']) {
    assert.equal(count(text), estimateTokensForFragments(model, 'user', [history, createTextContentFragment(text)], true, 'test'));
  }
  assert.equal(counted, 4);
  const before = count('hello');
  assert.equal(history.part.pt, 'text');
  if (history.part.pt !== 'text') throw new Error('Expected text');
  history.part.text = 'Revised entirely';
  const after = count('hello');
  assert.notEqual(after, before);
  assert.equal(after, estimateTokensForFragments(model, 'user', [history, createTextContentFragment('hello')], true, 'test'));
  assert.equal(cached(model, 'assistant', [history], true, 'test'), estimateTokensForFragments(model, 'assistant', [history], true, 'test'));
});
