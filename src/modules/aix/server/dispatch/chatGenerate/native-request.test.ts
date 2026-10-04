import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatGenerateDispatch } from './chatGenerate.dispatch';
import { nativeRequestPrefix, prepareNativeRequest } from './native-request';
import { aixAnthropicHostedFeatures, aixToAnthropicMessageCreate } from './adapters/anthropic.messageCreate';
import type { AixAPI_Model, AixAPIChatGenerate_Request, AixAPI_Access } from '../../api/aix.wiretypes';
import { AixWire_API_ChatContentGenerate } from '../../api/aix.wiretypes';
import { aixCGR_ChatSequence_FromDMessagesOrThrow } from '~/modules/aix/client/aix.client.chatGenerateRequest';
import { createDMessageTextContent } from '~/common/stores/chat/chat.message';
import { env } from '~/server/env.server';

const access: AixAPI_Access = { dialect: 'anthropic', anthropicKey: '', anthropicHost: null };
for (const id of ['claude-opus-5-5', 'claude-sonnet-5-5']) {
  const model: AixAPI_Model = { id, acceptsOutputs: ['text'], vndAntThinkingBudget: 'adaptive', reasoningEffort: 'medium' };
  test(`${id} final dispatch suppresses binding in body and headers and enforces effective code policy`, async () => {
    const oldHost = env.ANTHROPIC_API_HOST; Reflect.set(env, 'ANTHROPIC_API_HOST', 'https://gateway.test/anthropic');
    try {
      const request: AixAPIChatGenerate_Request = { systemMessage: null, chatSequence: await aixCGR_ChatSequence_FromDMessagesOrThrow([createDMessageTextContent('user', 'Hello'), createDMessageTextContent('assistant', 'Legacy answer'), createDMessageTextContent('user', 'Continue')]) };
      AixWire_API_ChatContentGenerate.Request_schema.parse(request);
      const dispatch = await createChatGenerateDispatch(access, model, request, true, undefined, false);
      assert.equal(dispatch.request.method, 'POST');
      if (dispatch.request.method !== 'POST') throw new Error('Expected POST');
      assert.ok('thinking' in dispatch.request.body);
      const thinking = dispatch.request.body.thinking;
      assert.ok(thinking && typeof thinking === 'object' && 'type' in thinking);
      assert.equal(thinking.type, 'adaptive');
      assert.equal(Object.hasOwn(thinking, 'block_binding'), false);
      const headers = new Headers(dispatch.request.headers);
      assert.equal((headers.get('anthropic-beta') ?? '').includes('thinking-binding-controls'), false);
      assert.equal(headers.get('user-agent'), 'AI-GUI/0.1 (claude-code-compatible)');
      for (const function_call of [{ name: 'custom', description: 'Custom', input_schema: { properties: {} }, allowed_callers: ['code_execution' as const] }, { name: 'custom', description: 'Custom', input_schema: { properties: {} }, input_examples: [{}] }]) {
        await assert.rejects(createChatGenerateDispatch(access, model, { ...request, tools: [{ type: 'function_call', function_call }] }, true, undefined, false), /unsupported/);
      }
      await assert.rejects(createChatGenerateDispatch(access, { ...model, vndAntCodeSandbox: 'auto' }, request, true, undefined, false), /unsupported/);
      await createChatGenerateDispatch(access, model, { ...request, tools: [{ type: 'function_call', function_call: { name: 'ask_user_question', description: 'Ask', input_schema: { properties: {} } } }] }, true, undefined, false);
    } finally { Reflect.set(env, 'ANTHROPIC_API_HOST', oldHost); }
  });
  test(`${id} signed native reasoning requires unchanged system, project, prefix and tools`, async () => {
    const request: AixAPIChatGenerate_Request = { systemMessage: { parts: [{ pt: 'text', text: 'System' }] }, chatSequence: [{ role: 'user', parts: [{ pt: 'text', text: 'Project context' }] }, { role: 'user', parts: [{ pt: 'text', text: 'Task' }] }] };
    const requestPrefix = await nativeRequestPrefix(model, request, 2);
    request.chatSequence.push({ role: 'model', parts: [{ pt: 'text', text: 'Ask' }, { pt: 'tool_invocation', id: 'q', invocation: { type: 'function_call', name: 'ask_user_question', args: '{}' } }], nativeHistory: { provider: 'anthropic-messages', deployment: 'test', model: id, projection: '', requestPrefix, segments: [{ id: 'reply', content: [{ type: 'thinking', thinking: 'Reasoning', signature: 'signed' }, { type: 'redacted_thinking', data: 'opaque' }, { type: 'text', text: 'Ask' }, { type: 'tool_use', id: 'q', name: 'ask_user_question', input: {} }] }] } });
    const wire = async (input: AixAPIChatGenerate_Request, target = model, deployment = 'test') => aixToAnthropicMessageCreate('anthropic', target, await prepareNativeRequest(target, input, deployment), true, { ...aixAnthropicHostedFeatures(target, input), nativeDeployment: deployment, enableThinkingBindingControls: false });
    assert.equal((await wire(request)).messages.flatMap(m => m.content).filter(b => b.type === 'thinking').length, 1);
    const answered = structuredClone(request); const last = answered.chatSequence[2];
    if (last.role === 'model') last.parts.push({ pt: 'tool_response', id: 'q', response: { type: 'function_call', name: 'ask_user_question', result: '{}' }, error: false });
    const answerBody = await wire(answered);
    assert.equal(answerBody.messages.flatMap(m => m.content).filter(b => b.type === 'thinking').length, 1);
    assert.equal(answerBody.messages.flatMap(m => m.content).filter(b => b.type === 'tool_result').length, 1);
    for (const change of ['system', 'project', 'prefix', 'projection', 'tools', 'unknown']) {
      const edited = structuredClone(request);
      if (change === 'system') edited.systemMessage!.parts = [{ pt: 'text', text: 'Changed system' }];
      if (change === 'project' || change === 'prefix') edited.chatSequence[change === 'project' ? 0 : 1].parts = [{ pt: 'text', text: 'Changed prefix' }];
      if (change === 'projection' || change === 'unknown') { const last = edited.chatSequence[2]; if (last.role === 'model') delete last.nativeHistory; }
      if (change === 'tools') edited.tools = [{ type: 'function_call', function_call: { name: 'different', description: 'Different', input_schema: { properties: {} } } }];
      assert.equal((await wire(edited)).messages.flatMap(m => m.content).filter(b => b.type === 'thinking' || b.type === 'redacted_thinking').length, 0, change);
    }
    for (const [target, deployment] of [[{ ...model, id: 'other' }, 'test'], [model, 'other']] as const) assert.equal((await wire(request, target, deployment)).messages.flatMap(m => m.content).filter(b => b.type === 'thinking').length, 0);
    assert.equal(request.chatSequence[2].role === 'model' && request.chatSequence[2].nativeHistory?.segments[0].content[0].type, 'thinking');
  });
}

for (const id of ['claude-opus-5-5', 'claude-sonnet-5-5']) test(`${id} rejects incomplete native search history before dispatch without rewriting it`, async () => {
  const model: AixAPI_Model = { id, acceptsOutputs: ['text'], vndAntThinkingBudget: 'adaptive', reasoningEffort: 'medium' };
  const request: AixAPIChatGenerate_Request = { systemMessage: null, chatSequence: [
    { role: 'user', parts: [{ pt: 'text', text: 'Search then ask me' }] },
    { role: 'model', parts: [], nativeHistory: { provider: 'anthropic-messages', deployment: 'test', model: id, projection: '', segments: [
      { id: 'search-turn', content: [{ type: 'server_tool_use', id: 'search', name: 'web_search', input: {} }, { type: 'tool_use', id: 'question', name: 'ask_user_question', input: {} }] },
    ] } },
  ] };
  const original = structuredClone(request);
  await assert.rejects(prepareNativeRequest(model, request, 'test'), /Retry that search turn or branch/);
  assert.deepEqual(request, original);
  const completed = structuredClone(request); const assistant = completed.chatSequence[1];
  if (assistant.role !== 'model' || !assistant.nativeHistory) throw new Error('Expected native model message');
  assistant.nativeHistory.segments.push({ id: 'result-segment', content: [{ type: 'web_search_tool_result', tool_use_id: 'search', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } }] });
  await assert.doesNotReject(prepareNativeRequest(model, completed, 'test'));
  // Ineligible provider/model history isn't replayed, so it must not block changing models.
  await assert.doesNotReject(prepareNativeRequest({ ...model, id: 'other' }, request, 'test'));
});
