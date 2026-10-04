import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aixCreateModelFromLLMOptions } from '~/modules/aix/client/aix.client';
import { aixCGR_ChatSequence_FromDMessagesOrThrow, aixCGR_SystemMessage_FromDMessageOrThrow } from '~/modules/aix/client/aix.client.chatGenerateRequest';
import { aixAnthropicHostedFeatures, aixToAnthropicMessageCreate } from '~/modules/aix/server/dispatch/chatGenerate/adapters/anthropic.messageCreate';
import { createDConversation } from '~/common/stores/chat/chat.conversation';
import { useChatStore } from '~/common/stores/chat/store-chats';
import { useModelsStore } from '~/common/stores/llms/store-llms';
import { useFolderStore } from '~/common/stores/folders/store-chat-folders';
import { assembleRequest } from './assemble-request';
import { localTools } from './local-tool-dispatch';
import { nativeHistoryProjection } from './native-history';
import { usePersonalSettings } from './store-personal-settings';
import { useProjectFilesStore } from './store-project-files';
import { pauseDiskWrites } from './disk-storage';
import { CHAT_EFFORTS, chatParameters, normalizeChatConfig } from './chat-config';
import { createDMessageTextContent, createDMessageFromFragments, MESSAGE_FLAG_VND_ANT_CACHE_USER } from '~/common/stores/chat/chat.message';
import { createDocAttachmentFragment, createDMessageDataInlineText, create_FunctionCallInvocation_ContentFragment, create_FunctionCallResponse_ContentFragment } from '~/common/stores/chat/chat.fragments';
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
for (const modelId of ['claude-opus-5-5', 'claude-sonnet-5-5'] as const) test(`${modelId} assembled instructions, skills, attachment and native/local history fit the final cache limit`, async t => {
  const saved = { chats: useChatStore.getState(), folders: useFolderStore.getState(), models: useModelsStore.getState(), personal: usePersonalSettings.getState(), files: useProjectFilesStore.getState() };
  pauseDiskWrites(true);
  t.after(() => {
    useChatStore.setState(saved.chats); useFolderStore.setState(saved.folders); useModelsStore.setState(saved.models);
    usePersonalSettings.setState(saved.personal); useProjectFilesStore.setState(saved.files);
    pauseDiskWrites(false);
  });
  const chat = createDConversation();
  chat.chatConfig = { ...normalizeChatConfig(), llmId: modelId };
  const pinned = createDMessageTextContent('user', 'PINNED REQUEST'); pinned.userFlags = [MESSAGE_FLAG_VND_ANT_CACHE_USER];
  const previous = createDMessageTextContent('user', 'READ AND RESEARCH');
  const args = { folder_id: 'repo-id', path: 'source.txt' };
  const localResult = JSON.stringify({ text: 'ON-DEMAND FILE RESULT', sha256: 'a'.repeat(64) });
  const assistant = createDMessageFromFragments('assistant', [
    create_FunctionCallInvocation_ContentFragment('read-id', 'folder_read', JSON.stringify(args)),
    create_FunctionCallResponse_ContentFragment('read-id', false, 'folder_read', localResult, 'client'),
  ]);
  const nativeContent = [
    { type: 'server_tool_use', id: 'search-id', name: 'web_search', input: { query: 'native source' } },
    { type: 'web_search_tool_result', tool_use_id: 'search-id', content: [{ type: 'web_search_result', title: 'Native source', url: 'https://example.com/source', encrypted_content: 'OPAQUE SOURCE', unknown: { keep: true } }] },
    { type: 'text', text: 'NATIVE ANSWER', citations: [{ type: 'web_search_result_location', url: 'https://example.com/source', title: 'Native source', encrypted_index: 'OPAQUE INDEX', cited_text: 'Source fact' }] },
    { type: 'tool_use', id: 'read-id', name: 'folder_read', input: args },
  ];
  assistant.generator = { mgt: 'aix', name: modelId, aix: { mId: modelId, vId: 'anthropic' }, nativeHistory: {
    provider: 'anthropic-messages', deployment: 'wire-test', model: modelId, projection: nativeHistoryProjection(assistant.fragments), segments: [{ id: 'native-turn', content: nativeContent }],
  } };
  const latest = createDMessageTextContent('user', 'LATEST REQUEST');
  latest.metadata = { selectedSkills: [{ id: 'skill-id', origin: 'claude', name: 'Selected skill', revision: 'skill-rev', instructions: 'SELECTED SKILL INSTRUCTIONS', resources: [{ path: 'reference.md', revision: 'resource-rev', content: 'SELECTED SKILL RESOURCE' }] }] };
  latest.fragments.push(createDocAttachmentFragment('attached.txt', 'New attachment', 'text/plain', createDMessageDataInlineText('NEW ATTACHMENT CONTENT', 'text/plain'), 'attachment-source', 1));
  chat.messages = [pinned, createDMessageTextContent('assistant', 'PINNED ANSWER'), previous, assistant, latest];
  useChatStore.setState({ conversations: [chat] });
  useModelsStore.setState({ llms: [{ id: modelId, label: modelId, created: 0, description: '', hidden: false, contextTokens: 1_000_000, maxOutputTokens: 16384, interfaces: [LLM_IF_OAI_Reasoning, LLM_IF_HOTFIX_NoTemperature], parameterSpecs: [], initialParameters: {}, sId: 'test', vId: 'anthropic' }] });
  usePersonalSettings.setState({ instructions: 'PERSONAL INSTRUCTIONS' });
  useFolderStore.setState({ folders: [{ id: 'project-id', title: 'Project', conversationIds: [chat.id], instructions: 'PROJECT INSTRUCTIONS', revision: 3, connectedFolders: [{ id: 'repo-id', name: 'Connected repo', path: '/private/tmp/wire-test-repo' }], fileIds: ['historical-file'] }] });
  useProjectFilesStore.setState({ files: { 'historical-file': { id: 'historical-file', assetId: 'historical-asset', version: 'old', name: 'old.txt', mime: 'text/plain', size: 10, status: 'ready', warnings: [], tokenEstimates: {}, fragments: [createDocAttachmentFragment('old.txt', 'Historical snapshot', 'text/plain', createDMessageDataInlineText('DO NOT BULK INJECT HISTORICAL FILE', 'text/plain'), 'old-source', 1)] } } });

  const original = structuredClone(chat.messages);
  const assembled = assembleRequest(chat.id, modelId, chat.messages);
  const request = { systemMessage: await aixCGR_SystemMessage_FromDMessageOrThrow(assembled.system), chatSequence: await aixCGR_ChatSequence_FromDMessagesOrThrow(assembled.messages), tools: localTools, toolsPolicy: { type: 'auto' as const } };
  const model = aixCreateModelFromLLMOptions([LLM_IF_OAI_Reasoning, LLM_IF_HOTFIX_NoTemperature], chatParameters(chat.chatConfig), undefined, modelId);
  const wire = aixToAnthropicMessageCreate('anthropic', model, request, true, { ...aixAnthropicHostedFeatures(model, request), nativeDeployment: 'wire-test' });
  const blocks = wire.messages.flatMap(message => message.content);
  const markers = [...(wire.system || []), ...blocks, ...(wire.tools || [])].filter(block => 'cache_control' in block && block.cache_control);
  assert.equal(markers.length, 4);
  assert.equal(wire.cache_control, undefined);
  assert.ok(wire.system?.at(-1)?.cache_control);
  const systemText = wire.system?.map(block => block.text).join('\n') || '';
  assert.match(systemText, /PERSONAL INSTRUCTIONS[\s\S]*PROJECT INSTRUCTIONS/);
  assert.match(systemText, /"id":"repo-id","name":"Connected repo"/);
  assert.doesNotMatch(JSON.stringify(wire), /DO NOT BULK INJECT HISTORICAL FILE|\/private\/tmp\/wire-test-repo/);
  assert.deepEqual(assembled.context, { projectId: 'project-id', instructionRevision: 3, files: [] });
  const pinnedBlock = blocks.find(block => block.type === 'text' && block.text === 'PINNED REQUEST');
  const previousBlock = blocks.find(block => block.type === 'text' && block.text === 'READ AND RESEARCH');
  assert.ok(pinnedBlock && 'cache_control' in pinnedBlock && pinnedBlock.cache_control);
  assert.ok(previousBlock && 'cache_control' in previousBlock && previousBlock.cache_control);
  assert.deepEqual(wire.messages.find(message => message.role === 'assistant' && message.content.some(block => block.type === 'server_tool_use'))?.content, nativeContent);
  const results = blocks.filter(block => block.type === 'tool_result');
  assert.equal(results.length, 1); assert.equal(results[0].tool_use_id, 'read-id');
  assert.match(JSON.stringify(results[0].content), /ON-DEMAND FILE RESULT/);
  assert.equal(blocks.filter(block => block.type === 'tool_use' && block.id === 'read-id').length, 1);
  const final = wire.messages.at(-1);
  assert.equal(final?.role, 'user');
  const finalText = final?.content.filter(block => block.type === 'text').map(block => block.text) || [];
  assert.equal(finalText.length, 3);
  assert.match(finalText[0], /SELECTED SKILL INSTRUCTIONS[\s\S]*SELECTED SKILL RESOURCE/);
  assert.equal(finalText[1], 'LATEST REQUEST');
  assert.match(finalText[2], /attachment-source[\s\S]*NEW ATTACHMENT CONTENT/);
  const finalBlock = final?.content.at(-1);
  assert.ok(finalBlock && 'cache_control' in finalBlock && finalBlock.cache_control);
  assert.deepEqual(chat.messages, original);
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
