import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterCrossModelReasoning } from './reasoning';
import { createDMessageTextContent } from '~/common/stores/chat/chat.message';
import { createModelAuxVoidFragment } from '~/common/stores/chat/chat.fragments';
test('cross-model replay omits signed thinking while keeping the stored transcript', () => {
  const message = createDMessageTextContent('assistant', 'Answer');
  message.generator = { mgt: 'aix', name: 'Sonnet', aix: { vId: 'anthropic', mId: 'claude-sonnet-5-5' } };
  message.fragments.push(createModelAuxVoidFragment('reasoning', 'Thinking', 'signature'));
  assert.equal(filterCrossModelReasoning([message], 'claude-opus-5-5')[0].fragments.length, 1);
  assert.equal(message.fragments.length, 2);
  assert.equal(filterCrossModelReasoning([message], 'claude-sonnet-5-5')[0].fragments.length, 2);
});
