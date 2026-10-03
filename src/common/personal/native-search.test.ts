import type { IParticleTransmitter } from '~/modules/aix/server/dispatch/chatGenerate/parsers/IParticleTransmitter';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContentReassembler } from '~/modules/aix/client/ContentReassembler';
import { ChatGenerateTransmitter } from '~/modules/aix/server/dispatch/chatGenerate/ChatGenerateTransmitter';
import { createAnthropicMessageParser, createAnthropicMessageParserNS } from '~/modules/aix/server/dispatch/chatGenerate/parsers/anthropic.parser';
import { aixCGR_ChatSequence_FromDMessagesOrThrow } from '~/modules/aix/client/aix.client.chatGenerateRequest';
import { aixAnthropicHostedFeatures, aixToAnthropicMessageCreate } from '~/modules/aix/server/dispatch/chatGenerate/adapters/anthropic.messageCreate';
import { createDMessageTextContent, duplicateDMessage } from '~/common/stores/chat/chat.message';
import { createDConversation } from '~/common/stores/chat/chat.conversation';
import { create_FunctionCallResponse_ContentFragment } from '~/common/stores/chat/chat.fragments';
import { commitWorkspace, loadWorkspace, backupWorkspace, restoreWorkspace } from '~/server/local/workspace';
import { emptyWorkspace } from './workspace-schema';
import { eligibleNativeHistory } from './native-history';
import type { AixAPI_Model } from '~/modules/aix/server/api/aix.wiretypes';

for (const model of ['claude-opus-5-5', 'claude-sonnet-5-5']) for (const streaming of [true, false]) test(`${model} ${streaming ? 'SSE' : 'JSON'} native content survives parser, disk and authoritative replay`, async () => {
  const content = [
    { type: 'thinking', thinking: 'Research', signature: 'signed-thinking' },
    { type: 'server_tool_use', id: 'search', name: 'web_search', input: { query: 'Current news' } },
    { type: 'web_search_tool_result', tool_use_id: 'search', content: [{ type: 'web_search_result', title: 'Source', url: 'https://example.com/news', encrypted_content: 'opaque-encrypted', page_age: 'today', unknown: { createdAt: 'opaque-not-a-date', nested: [null, { keep: true }] } }] },
    { type: 'text', text: 'Answer', citations: [{ type: 'web_search_result_location', url: 'https://example.com/news', title: 'Source', encrypted_index: 'opaque-index', cited_text: 'Quoted fact' }] },
    { type: 'tool_use', id: 'question', name: 'ask_user_question', input: { questions: [{ id: 'choice', text: 'Continue?' }] } },
  ];
  const pt = new ChatGenerateTransmitter('Anthropic');
  if (streaming) {
    const parse = createAnthropicMessageParser({ deployment: 'test-deployment', model, requestPrefix: 'saved-prefix' });
    parse(pt, JSON.stringify({ type: 'message_start', message: { id: 'message-native', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } }), 'message_start');
    for (const [index, block] of content.entries()) {
      const start = block.type === 'server_tool_use' ? { ...block, input: {} } : block;
      parse(pt, JSON.stringify({ type: 'content_block_start', index, content_block: start }), 'content_block_start');
      if (block.type === 'server_tool_use') parse(pt, JSON.stringify({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } }), 'content_block_delta');
      parse(pt, JSON.stringify({ type: 'content_block_stop', index }), 'content_block_stop');
    }
    parse(pt, JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 5 } }), 'message_delta');
    parse(pt, JSON.stringify({ type: 'message_stop' }), 'message_stop');
  } else createAnthropicMessageParserNS({ deployment: 'test-deployment', model, requestPrefix: 'saved-prefix' })(pt, JSON.stringify({ id: 'message-native', type: 'message', role: 'assistant', model, content, stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 5 } }));
  const reassembler = new ContentReassembler({ mgt: 'aix', name: model, aix: { mId: model, vId: 'anthropic' } }, undefined, undefined, []);
  if (!pt.isEnded) pt.setDialectEnded('done-dialect');
  const particles = [...pt.flushParticles()];
  for (const particle of particles) reassembler.enqueueWireParticle(particle);
  await reassembler.waitForWireComplete();
  const result = reassembler.finalizeReassembly();
  const assistant = { ...createDMessageTextContent('assistant', ''), fragments: [...result.fragments], generator: structuredClone(result.generator) };
  assert.deepEqual(assistant.generator.nativeHistory?.segments[0].content, content);
  assert.equal(assistant.generator.nativeHistory?.requestPrefix, 'saved-prefix');
  assert.ok(eligibleNativeHistory(assistant.generator.nativeHistory, assistant.fragments));
  assert.ok(particles.some(p => 'p' in p && p.p === 'vp' && p.iTexts?.[0].includes('Current news')));
  assert.ok(particles.some(p => 'p' in p && p.p === 'vp' && p.sources?.[0].url === 'https://example.com/news'));
  assistant.fragments.push(create_FunctionCallResponse_ContentFragment('question', false, 'ask_user_question', '{"answers":{"choice":"Yes"}}', 'client'));
  const workspace = emptyWorkspace(); const { _abortController, ...chat } = createDConversation();
  chat.messages = [createDMessageTextContent('user', 'Research'), assistant];
  workspace.stores['app-chats'] = { version: 5, state: { conversations: [chat] } };
  const dir = await mkdtemp(join(tmpdir(), 'ai-gui-native-')); await commitWorkspace(workspace, 0, dir);
  const restoredDir = await mkdtemp(join(tmpdir(), 'ai-gui-native-restored-')); await restoreWorkspace(await backupWorkspace(dir), 0, restoredDir);
  const saved = (await loadWorkspace(restoredDir)).workspace!;
  const stored = (saved.stores['app-chats']!.state.conversations as typeof chat[])[0].messages[1];
  assert.deepEqual(stored.generator?.nativeHistory?.segments[0].content, content);
  assert.equal(stored.generator?.nativeHistory?.requestPrefix, 'saved-prefix');
  const { installWorkspace, currentWorkspace, pauseDiskWrites } = await import('./disk-storage');
  pauseDiskWrites(true); installWorkspace(saved);
  assert.deepEqual((currentWorkspace().stores['app-chats']!.state.conversations as typeof chat[])[0].messages[1].generator?.nativeHistory?.segments[0].content, content);
  const duplicated = duplicateDMessage(stored, false);
  assert.deepEqual(duplicated.generator?.nativeHistory, stored.generator?.nativeHistory);
  const request = { systemMessage: null, chatSequence: await aixCGR_ChatSequence_FromDMessagesOrThrow([chat.messages[0], stored]) };
  const apiModel: AixAPI_Model = { id: model, acceptsOutputs: ['text'], vndAntThinkingBudget: 'adaptive', reasoningEffort: 'medium' };
  const features = { ...aixAnthropicHostedFeatures(apiModel, request), nativeDeployment: 'test-deployment' };
  const body = aixToAnthropicMessageCreate('anthropic', apiModel, request, streaming, features);
  assert.deepEqual(body.messages[1].content, content);
  assert.equal(body.messages.flatMap(m => m.content).filter(b => b.type === 'tool_result').length, 1);
  for (const changed of [{ ...apiModel, id: 'other-model' }, apiModel]) {
    const other = aixToAnthropicMessageCreate('anthropic', changed, request, streaming, { ...features, nativeDeployment: changed.id === model ? 'other-deployment' : features.nativeDeployment });
    assert.equal(other.messages.flatMap(m => m.content).filter(b => b.type === 'server_tool_use').length, 0);
  }
  const text = stored.fragments.find(f => 'part' in f && f.part.pt === 'text');
  if (text && 'part' in text && text.part.pt === 'text') text.part.text += ' edited';
  assert.equal(eligibleNativeHistory(stored.generator?.nativeHistory, stored.fragments), undefined);
});

test('native pause segments replace snapshots, append ordered turns, rollback retries and retain settled data on stop', async () => {
  const { DispatchContinuationSignal } = await import('~/modules/aix/server/dispatch/chatGenerate/chatGenerate.continuation');
  const model = 'claude-opus-5-5';
  const reassembler = new ContentReassembler({ mgt: 'aix', name: model, aix: { mId: model, vId: 'anthropic' } }, undefined, undefined, []);
  const parseTurn = async (id: string, text: string, stop: 'pause_turn' | 'end_turn') => {
    const pt = new ChatGenerateTransmitter('Anthropic');
    const content = [{ type: 'text', text }];
    let continuation: InstanceType<typeof DispatchContinuationSignal> | undefined;
    try { createAnthropicMessageParserNS({ deployment: 'test', model })(pt, JSON.stringify({ id, type: 'message', role: 'assistant', model, content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } })); }
    catch (error) { if (!(error instanceof DispatchContinuationSignal)) throw error; continuation = error; }
    for (const particle of pt.flushParticles()) reassembler.enqueueWireParticle(particle);
    await reassembler.waitForWireComplete(); return continuation;
  };
  const first = await parseTurn('one', 'First', 'pause_turn');
  const body = first!.continuation.mutateBody({ messages: [{ role: 'user', content: [{ type: 'text', text: 'Task' }] }] });
  assert.deepEqual((body.messages as { role: string; content: unknown[] }[])[1].content, [{ type: 'text', text: 'First' }]);
  reassembler.enqueueWireParticle({ cg: 'aix-info', ait: 'flow-cont', text: 'Continuing' }); await reassembler.waitForWireComplete();
  await parseTurn('two', 'Discard retry', 'pause_turn');
  reassembler.enqueueWireParticle({ cg: 'aix-retry-reset', rScope: 'srv-op', rClearStrategy: 'since-checkpoint', attempt: 1, maxAttempts: 2, delayMs: 0, reason: 'retry' }); await reassembler.waitForWireComplete();
  assert.deepEqual(reassembler.S.generator.nativeHistory?.segments.map(segment => segment.id), ['one']);
  await parseTurn('two', 'Final', 'end_turn');
  assert.deepEqual(reassembler.S.generator.nativeHistory?.segments.map(segment => segment.id), ['one', 'two']);
  assert.equal(reassembler.S.generator.nativeHistory?.segments[1].content[0].text, 'Final');
  reassembler.setClientAborted();
  const result = reassembler.finalizeReassembly();
  assert.deepEqual(result.generator.nativeHistory?.segments.map(segment => segment.id), ['one', 'two']);
});

test('native continuation budget ends after five follow-ups and preserves final particles', async () => {
  const { executeChatGenerateWithContinuation, DispatchContinuationSignal } = await import('~/modules/aix/server/dispatch/chatGenerate/chatGenerate.continuation');
  const { _createDebugConfig } = await import('~/modules/aix/server/dispatch/chatGenerate/chatGenerate.debug');
  const controller = new AbortController(); let requests = 0; let contentParticles = 0;
  const creator = async () => ({
    request: { url: 'https://unused.test', headers: {}, method: 'POST' as const, body: { messages: [] } }, demuxerFormat: null,
    customConnect: async () => { requests++; return Response.json({}); },
    chatGenerateParse: (pt: IParticleTransmitter) => {
      pt.appendText('settled'); pt.endMessagePart();
      throw new DispatchContinuationSignal({ reason: 'pause_turn', mutateBody: body => body });
    },
  });
  await assert.rejects(async () => {
    for await (const particle of executeChatGenerateWithContinuation(creator, controller.signal, _createDebugConfig({ dialect: 'anthropic', anthropicKey: '', anthropicHost: null }, undefined, 'test'))) if ('t' in particle) contentParticles++;
  }, /limit reached/);
  assert.equal(requests, 6); assert.equal(contentParticles, 6);
});
