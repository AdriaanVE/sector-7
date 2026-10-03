import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendingFunctionCalls, folderToolInput } from './folder-tools';
import { createDMessageFromFragments } from '~/common/stores/chat/chat.message';
import { create_FunctionCallResponse_ContentFragment, create_FunctionCallInvocation_ContentFragment } from '~/common/stores/chat/chat.fragments';
import { eligibleNativeHistory, nativeHistoryProjection } from './native-history';

test('local/question mixed batches settle once while question remains paused and native encrypted history stays eligible', () => {
  const call = create_FunctionCallInvocation_ContentFragment('local-id', 'folder_read', '{"folder_id":"root","path":"file"}');
  const question = create_FunctionCallInvocation_ContentFragment('question-id', 'ask_user_question', '{"questions":[{"id":"q","text":"Choose"}]}');
  const message = createDMessageFromFragments('assistant', [call, call, question]);
  const history = { provider: 'anthropic-messages' as const, deployment: 'test', model: 'claude', projection: nativeHistoryProjection(message.fragments), segments: [{ id: 'segment', content: [{ type: 'redacted_thinking', data: 'encrypted' }, { type: 'tool_use', id: 'local-id', name: 'folder_read', input: { folder_id: 'root', path: 'file' } }] }] };
  assert.deepEqual(pendingFunctionCalls(message).map(call => call.id), ['local-id', 'question-id']);
  message.fragments.push(create_FunctionCallResponse_ContentFragment('local-id', false, 'folder_read', '{"text":"contents"}', 'client'));
  assert.deepEqual(pendingFunctionCalls(message).map(call => call.id), ['question-id']);
  assert.deepEqual(eligibleNativeHistory(history, message.fragments), history);
  message.fragments.push(create_FunctionCallResponse_ContentFragment('question-id', false, 'ask_user_question', '{"answers":{"q":"yes"}}', 'client'));
  assert.equal(pendingFunctionCalls(message).length, 0);
});
test('tool schemas bound offsets, replacements and reject undefined operations', () => {
  assert.equal(folderToolInput.parse({ name: 'folder_read', folder_id: 'root' }).path, '');
  assert.throws(() => folderToolInput.parse({ name: 'folder_read', folder_id: 'root', offset: -1 }));
  assert.throws(() => folderToolInput.parse({ name: 'folder_edit', folder_id: 'root', path: 'file', sha256: 'a'.repeat(64), old_text: '', new_text: 'x' }));
  assert.throws(() => folderToolInput.parse({ name: 'shell', folder_id: 'root' }));
});
