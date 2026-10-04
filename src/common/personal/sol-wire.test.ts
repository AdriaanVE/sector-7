import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatParameters, normalizeChatConfig } from './chat-config';
import { aixCreateModelFromLLMOptions } from '~/modules/aix/client/aix.client';
import { aixToOpenAIResponses } from '~/modules/aix/server/dispatch/chatGenerate/adapters/openai.responsesCreate';
import { openAIModelToModelDescription } from '~/modules/llms/server/openai/models/openai.models';
import { type DModelInterfaceV1, LLM_IF_OAI_Responses } from '~/common/stores/llms/llms.types';
import { aixAnthropicHostedFeatures, aixToAnthropicMessageCreate } from '~/modules/aix/server/dispatch/chatGenerate/adapters/anthropic.messageCreate';
import { hardcodedAnthropicModels } from '~/modules/llms/server/anthropic/anthropic.models';
import { assertPersonalHostedTools } from '~/modules/llms/server/anthropic/personal-access';

test('GPT-6.1 Sol sends current hosted search and code execution with user-selected effort', () => {
  const config = normalizeChatConfig({ llmId: 'gpt-6.1-sol', effort: 'high', tools: { webSearch: true, webFetch: false, codeSandbox: true } });
  const definition = openAIModelToModelDescription('gpt-6.1-sol');
  assert.ok(definition.interfaces.includes(LLM_IF_OAI_Responses));
  const interfaces = definition.interfaces as DModelInterfaceV1[];
  const model = aixCreateModelFromLLMOptions(interfaces, { ...chatParameters(config), llmTemperature: 0.5 }, undefined, config.llmId);
  assert.equal(model.vndOaiResponsesAPI, true);
  const wire = aixToOpenAIResponses('openai', model, {
    systemMessage: null, chatSequence: [{ role: 'user', parts: [{ pt: 'text', text: 'Search and compute 17 * 19.' }] }],
    tools: [{ type: 'function_call', function_call: { name: 'folder_read', description: 'Read a file', input_schema: { properties: { path: { type: 'string' } }, required: ['path'] } } }],
    toolsPolicy: { type: 'auto' },
  }, true, false);
  assert.equal(wire.model, 'gpt-6.1-sol');
  assert.equal(wire.reasoning?.effort, 'high');
  assert.equal(wire.temperature, undefined);
  assert.ok(wire.tools?.some(tool => tool.type === 'web_search'));
  assert.ok(wire.tools?.some(tool => tool.type === 'code_interpreter' && typeof tool.container === 'object' && tool.container?.type === 'auto'));
  const disabled = normalizeChatConfig({ ...config, tools: { webSearch: false, webFetch: false, codeSandbox: false } });
  const disabledModel = aixCreateModelFromLLMOptions(interfaces, { ...chatParameters(disabled), llmTemperature: 0.5 }, undefined, config.llmId);
  const disabledWire = aixToOpenAIResponses('openai', disabledModel, { systemMessage: null, chatSequence: [{ role: 'user', parts: [{ pt: 'text', text: 'Hello' }] }] }, true, false);
  assert.equal(disabledWire.tools?.some(tool => tool.type === 'web_search' || tool.type === 'code_interpreter') ?? false, false);
  const searchOnly = normalizeChatConfig({ ...config, tools: { webSearch: true, webFetch: false, codeSandbox: false } });
  const searchOnlyModel = aixCreateModelFromLLMOptions(interfaces, { ...chatParameters(searchOnly), llmTemperature: 0.5 }, undefined, config.llmId);
  const searchOnlyWire = aixToOpenAIResponses('openai', searchOnlyModel, { systemMessage: null, chatSequence: [{ role: 'user', parts: [{ pt: 'text', text: 'Search' }] }] }, true, false);
  assert.ok(searchOnlyWire.tools?.some(tool => tool.type === 'web_search'));
  assert.equal(searchOnlyWire.tools?.some(tool => tool.type === 'code_interpreter') ?? false, false);
});

test('switching from Sol code execution to Claude keeps chat usable without unsupported hosted code', () => {
  const sol = normalizeChatConfig({ llmId: 'gpt-6.1-sol', tools: { webSearch: true, webFetch: false, codeSandbox: true } });
  const claude = normalizeChatConfig({ ...sol, llmId: 'claude-opus-5-5' });
  assert.equal(claude.tools.codeSandbox, true);
  const definition = hardcodedAnthropicModels.find(model => model.id === 'claude-opus-5-5')!;
  const model = aixCreateModelFromLLMOptions(definition.interfaces as DModelInterfaceV1[], { ...chatParameters(claude), llmTemperature: 0.5 }, undefined, claude.llmId);
  const request = { systemMessage: null, chatSequence: [{ role: 'user' as const, parts: [{ pt: 'text' as const, text: 'Continue the chat.' }] }] };
  const features = aixAnthropicHostedFeatures(model, request);
  assert.doesNotThrow(() => assertPersonalHostedTools(features));
  const wire = aixToAnthropicMessageCreate('anthropic', model, request, true, features);
  assert.ok(wire.tools?.some(tool => tool.type === 'web_search_20250305'));
  assert.equal(wire.tools?.some(tool => tool.name === 'code_execution') ?? false, false);
  const switchedBack = normalizeChatConfig({ ...claude, llmId: 'gpt-6.1-sol' });
  assert.equal(chatParameters(switchedBack).llmVndOaiCodeInterpreter, 'auto');
});
