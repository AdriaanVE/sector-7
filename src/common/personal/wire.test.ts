import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aixCreateModelFromLLMOptions } from '~/modules/aix/client/aix.client';
import { aixCGR_ChatSequence_FromDMessagesOrThrow, aixCGR_SystemMessage_FromDMessageOrThrow } from '~/modules/aix/client/aix.client.chatGenerateRequest';
import { aixAnthropicHostedFeatures, aixToAnthropicMessageCreate } from '~/modules/aix/server/dispatch/chatGenerate/adapters/anthropic.messageCreate';
import { CHAT_EFFORTS, chatParameters, normalizeChatConfig } from './chat-config';
import { createDMessageTextContent, createDMessageFromFragments, MESSAGE_FLAG_VND_ANT_CACHE_AUTO, MESSAGE_FLAG_VND_ANT_CACHE_USER } from '~/common/stores/chat/chat.message';
import { create_FunctionCallInvocation_ContentFragment, create_FunctionCallResponse_ContentFragment } from '~/common/stores/chat/chat.fragments';
import { LLM_IF_OAI_Reasoning, LLM_IF_HOTFIX_NoTemperature } from '~/common/stores/llms/llms.types';

const modelFor = (effort: typeof CHAT_EFFORTS[number] = 'medium') => aixCreateModelFromLLMOptions([LLM_IF_OAI_Reasoning, LLM_IF_HOTFIX_NoTemperature], chatParameters({ ...normalizeChatConfig(), effort }), undefined, 'claude-opus-5-5');
test('five effort replacements reach Anthropic wire with adaptive thinking', () => {
  const chat = { systemMessage: null, chatSequence: [{ role: 'user' as const, parts: [{ pt: 'text' as const, text: 'Hello' }] }] };
  for (const effort of CHAT_EFFORTS) {
    const model = modelFor(effort);
    const wire = aixToAnthropicMessageCreate('anthropic', model, chat, true, aixAnthropicHostedFeatures(model, chat));
    assert.equal(wire.thinking?.type, 'adaptive'); assert.equal(wire.output_config?.effort, effort);
  }
});
test('question response is paired with assistant tool_use as a user tool_result', async () => {
  const assistant = createDMessageFromFragments('assistant', [create_FunctionCallInvocation_ContentFragment('question_1', 'ask_user_question', JSON.stringify({ questions: [{ id: 'choice', text: 'Choose?' }] })), create_FunctionCallResponse_ContentFragment('question_1', false, 'ask_user_question', JSON.stringify({ answers: { choice: 'A' } }), 'client')]);
  const chat = { systemMessage: null, chatSequence: await aixCGR_ChatSequence_FromDMessagesOrThrow([createDMessageTextContent('user', 'Ask me'), assistant]) };
  const model = modelFor();
  const wire = aixToAnthropicMessageCreate('anthropic', model, chat, true, aixAnthropicHostedFeatures(model, chat));
  const uses = wire.messages.flatMap(message => message.content.filter(block => block.type === 'tool_use'));
  const results = wire.messages.flatMap(message => message.content.filter(block => block.type === 'tool_result'));
  assert.equal(uses.length, 1); assert.equal(results.length, 1); assert.equal(results[0].tool_use_id, 'question_1');
});
test('system, project, latest user and a pinned breakpoint fit final four-block cap', async () => {
  const system = createDMessageTextContent('system', 'Stable system'); system.userFlags = [MESSAGE_FLAG_VND_ANT_CACHE_AUTO];
  const project = createDMessageTextContent('user', 'Project files'); project.userFlags = [MESSAGE_FLAG_VND_ANT_CACHE_AUTO];
  const pin = createDMessageTextContent('user', 'Pinned'); pin.userFlags = [MESSAGE_FLAG_VND_ANT_CACHE_USER];
  const latest = createDMessageTextContent('user', 'Latest'); latest.userFlags = [MESSAGE_FLAG_VND_ANT_CACHE_AUTO];
  const chat = { systemMessage: await aixCGR_SystemMessage_FromDMessageOrThrow(system), chatSequence: await aixCGR_ChatSequence_FromDMessagesOrThrow([project, createDMessageTextContent('assistant', 'Context'), pin, createDMessageTextContent('assistant', 'More'), latest]) };
  const model = modelFor(); const wire = aixToAnthropicMessageCreate('anthropic', model, chat, true, aixAnthropicHostedFeatures(model, chat));
  assert.ok(wire.system?.[0].cache_control);
  assert.equal([...(wire.system || []), ...wire.messages.flatMap(message => message.content)].filter(block => 'cache_control' in block && block.cache_control).length, 4);
});

test('assistant messages without eligible native history omit the wire property', async () => {
  const legacy = createDMessageTextContent('assistant', 'Old answer');
  const edited = createDMessageTextContent('assistant', 'Edited answer');
  edited.generator = { mgt: 'aix', name: 'Claude', aix: { mId: 'claude-opus-5-5', vId: 'anthropic' }, nativeHistory: {
    provider: 'anthropic-messages', deployment: 'test', model: 'claude-opus-5-5', projection: 'before edit', segments: [],
  } };
  const messages = await aixCGR_ChatSequence_FromDMessagesOrThrow([legacy, edited]);
  assert.equal(messages.length, 2);
  for (const message of messages) assert.equal(Object.hasOwn(message, 'nativeHistory'), false);
});
