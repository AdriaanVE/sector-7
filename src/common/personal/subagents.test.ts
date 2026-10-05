import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function fixture(t: TestContext) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'sector7-subagent-')));
  const savedEnv = { data: process.env.AI_GUI_DATA_DIR, host: process.env.OPENAI_API_HOST, key: process.env.OPENAI_API_KEY };
  process.env.AI_GUI_DATA_DIR = directory;
  process.env.OPENAI_API_HOST = 'https://gateway.example.test/openai';
  process.env.OPENAI_API_KEY = 'fixture-key';
  const originalFetch = globalThis.fetch;
  const requests: Record<string, any>[] = [];
  let provider: (body: Record<string, any>, signal?: AbortSignal | null) => Promise<Response>;
  globalThis.fetch = async (url, init) => {
    const target = new URL(String(url), 'http://localhost');
    if (target.hostname === 'gateway.example.test') {
      const body = JSON.parse(String(init?.body)); requests.push(body);
      return provider(body, init?.signal);
    }
    const headers = new Headers(init?.headers); headers.set('host', target.host);
    const request = new Request(target, { ...init, headers });
    if (target.pathname === '/api/local/workspace') return workspace.PUT(request);
    if (target.pathname === '/api/local/folders') return folders.POST(request);
    if (target.pathname === '/api/local/skills') return skills.GET(request);
    if (target.pathname.startsWith('/api/edge/')) return edge.POST(request);
    throw new Error(`Unexpected HTTP request ${target.pathname}`);
  };
  const disk = await import('./disk-storage');
  const schema = await import('./workspace-schema');
  const chats = await import('~/common/stores/chat/store-chats');
  const projects = await import('~/common/stores/folders/store-chat-folders');
  const models = await import('~/common/stores/llms/store-llms');
  const personal = await import('./store-personal-settings');
  const config = await import('./chat-config');
  const message = await import('~/common/stores/chat/chat.message');
  const fragments = await import('~/common/stores/chat/chat.fragments');
  const { createDConversation } = await import('~/common/stores/chat/chat.conversation');
  const { openAIModelToModelDescription } = await import('~/modules/llms/server/openai/models/openai.models');
  const { llmsUpdateModelsForServiceOrThrow } = await import('~/modules/llms/llm.client');
  const workspace = await import('../../../app/api/local/workspace/route');
  const folders = await import('../../../app/api/local/folders/route');
  const skills = await import('../../../app/api/local/skills/route');
  const edge = await import('../../../app/api/edge/[trpc]/route');
  const serverWorkspace = await import('~/server/local/workspace');
  const { runSubagent } = await import('./subagents');
  const saved = { chats: chats.useChatStore.getState(), projects: projects.useFolderStore.getState(), models: models.useModelsStore.getState(), personal: personal.usePersonalSettings.getState() };
  t.after(async () => {
    disk.pauseDiskWrites(true);
    chats.useChatStore.setState(saved.chats); projects.useFolderStore.setState(saved.projects);
    models.useModelsStore.setState(saved.models); personal.usePersonalSettings.setState(saved.personal);
    disk.installWorkspace(schema.emptyWorkspace());
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({ AI_GUI_DATA_DIR: savedEnv.data, OPENAI_API_HOST: savedEnv.host, OPENAI_API_KEY: savedEnv.key })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  });
  disk.pauseDiskWrites(false); disk.installWorkspace(schema.emptyWorkspace());
  models.useModelsStore.setState({ llms: [], sources: [{ id: 'openai-local', label: 'Bifrost', vId: 'openai', setup: {} }] });
  // The real HTTP listing and client conversion must make Sol available by its canonical ID.
  await llmsUpdateModelsForServiceOrThrow('openai-local', { at: Date.now(), via: 'boot' });
  assert.equal(models.findLLMOrThrow('gpt-6.1-sol').initialParameters.llmRef, 'gpt-6.1-sol');
  assert.equal(openAIModelToModelDescription('gpt-6.1-sol').contextWindow, 1050000);
  const parent = createDConversation();
  parent.chatConfig = config.normalizeChatConfig({ llmId: 'claude-opus-5-5', effort: 'high', tools: { webSearch: true, webFetch: false, codeSandbox: true } });
  const call = { id: 'spawn-test', name: 'spawn_agent', args: JSON.stringify({ description: 'Read project fact', prompt: 'Read fact.txt in repo and report the fact.' }) };
  parent.messages = [message.createDMessageTextContent('user', 'Delegate to a Sol subagent.'), message.createDMessageFromFragments('assistant', [fragments.create_FunctionCallInvocation_ContentFragment(call.id, call.name, call.args)])];
  chats.useChatStore.setState({ conversations: [parent] });
  personal.usePersonalSettings.setState({ instructions: 'PERSONAL_CONTEXT' });
  projects.useFolderStore.setState({ folders: [{ id: 'project', title: 'Project', instructions: 'PROJECT_CONTEXT', revision: 1, fileIds: [], conversationIds: [parent.id], connectedFolders: [{ id: 'repo', name: 'repo', path: directory }] }] });
  await writeFile(join(directory, 'fact.txt'), 'The project fact is October.\n');
  await disk.flushDisk();
  return { parent, call, requests, runSubagent, chats, projects, disk, serverWorkspace, directory, message, fragments, setProvider: (next: typeof provider) => { provider = next; } };
}

function sse(items: Record<string, unknown>[], model = 'gpt-6.1-sol') {
  const response = { id: 'resp-fixture', object: 'response', created_at: 1, model, status: 'in_progress', output: [], usage: null };
  const events: Record<string, unknown>[] = [{ type: 'response.created', response }];
  for (const [output_index, item] of items.entries()) {
    events.push({ type: 'response.output_item.added', output_index, item });
    if (item.type === 'message') {
      const part = { type: 'output_text', text: 'The project fact is October.', annotations: [] };
      events.push({ type: 'response.content_part.added', output_index, content_index: 0, item_id: item.id, part });
      events.push({ type: 'response.output_text.delta', output_index, content_index: 0, item_id: item.id, delta: part.text });
      events.push({ type: 'response.output_text.done', output_index, content_index: 0, item_id: item.id, text: part.text });
      events.push({ type: 'response.content_part.done', output_index, content_index: 0, item_id: item.id, part });
    }
    events.push({ type: 'response.output_item.done', output_index, item });
  }
  events.push({ type: 'response.completed', response: { ...response, status: 'completed', output: items, usage: { input_tokens: 12, output_tokens: 10, total_tokens: 22 } } });
  return new Response(events.map((event, sequence_number) => `data: ${JSON.stringify({ ...event, sequence_number })}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } });
}

test('a subagent completes more than 32 local calls over more than seven rounds', async t => {
  const f = await fixture(t);
  let round = 0;
  f.setProvider(async () => {
    if (round === 9) return sse([{ type: 'message', id: 'long-answer', role: 'assistant', content: [], status: 'completed' }]);
    const current = round++;
    return sse(Array.from({ length: 4 }, (_, index) => ({ type: 'function_call', id: `fc-${current}-${index}`, call_id: `read-${current}-${index}`, name: 'folder_read', arguments: JSON.stringify({ folder_id: 'repo', path: 'fact.txt', offset: current * 4 + index }), status: 'completed' })));
  });
  const result = await f.runSubagent(f.call, f.parent.id, new AbortController().signal);
  assert.equal(result.status, 'ok');
  assert.equal(result.result, 'The project fact is October.');
  const child = f.chats.getConversation(String(result.conversationId))!;
  assert.equal(child.messages.flatMap(message => message.fragments).filter(fragment => fragment.ft === 'content' && fragment.part.pt === 'tool_response').length, 36);
});

test('repeated calls without new results pause once and return an incomplete summary to the parent', async t => {
  const f = await fixture(t);
  let reads = 0;
  f.setProvider(async body => {
    if (!body.tools?.length) return sse([{ type: 'message', id: 'paused-summary', role: 'assistant', content: [], status: 'completed' }]);
    if (reads > 4) throw new Error('Repeated calls must stop before a sixth execution.');
    return sse([{ type: 'function_call', id: `fc-repeat-${reads}`, call_id: `repeat-${reads++}`, name: 'folder_read', arguments: '{"folder_id":"repo","path":"fact.txt"}', status: 'completed' }]);
  });
  const result = await f.runSubagent(f.call, f.parent.id, new AbortController().signal);
  assert.equal(result.status, 'incomplete');
  assert.equal(result.reason, 'repeat-guard');
  assert.equal(result.resumable, true);
  assert.equal(result.result, 'The project fact is October.');
  assert.equal(reads, 3);
  const child = f.chats.getConversation(String(result.conversationId))!;
  assert.equal(child.lastOutcome, 'incomplete');
  const saved = (await f.serverWorkspace.loadWorkspace(f.directory)).workspace!;
  f.disk.pauseDiskWrites(true); f.chats.useChatStore.setState({ conversations: [] });
  f.disk.installWorkspace(saved); await f.chats.useChatStore.persist.rehydrate(); f.disk.pauseDiskWrites(false);
  assert.equal(f.chats.getConversation(child.id)!.lastOutcome, 'incomplete');
  const { DataAtRestV1 } = await import('~/common/stores/chat/chats.converters');
  const exported = DataAtRestV1.formatChatToJsonV1(f.chats.getConversation(child.id)!);
  const restored = DataAtRestV1.recreateConversation(exported)!;
  assert.equal(restored.lastOutcome, 'incomplete');
  assert.equal(restored.incompleteReason, 'repeat-guard');
});

test('a configured round cap summarizes without tools and records one resumable pause', async t => {
  const f = await fixture(t);
  const { SECTOR7_CHAT_EXECUTION } = await import('./runtime-config');
  const previous = SECTOR7_CHAT_EXECUTION.maxToolRounds;
  SECTOR7_CHAT_EXECUTION.maxToolRounds = 1;
  t.after(() => { SECTOR7_CHAT_EXECUTION.maxToolRounds = previous; });
  let rounds = 0;
  f.setProvider(async body => {
    if (!body.tools?.length) {
      assert.ok(!body.tools || body.tools.length === 0, 'Hosted search and code tools must also be disabled for the summary.');
      return sse([{ type: 'message', id: 'cap-summary', role: 'assistant', content: [], status: 'completed' }]);
    }
    return sse(Array.from({ length: 3 }, (_, i) => ({ type: 'function_call', id: `fc-cap-${rounds}-${i}`, call_id: `cap-${rounds++}-${i}`, name: 'folder_read', arguments: JSON.stringify({ folder_id: 'repo', path: 'fact.txt', offset: i }), status: 'completed' })));
  });
  const result = await f.runSubagent(f.call, f.parent.id, new AbortController().signal);
  assert.equal(result.status, 'incomplete');
  assert.equal(result.reason, 'round-limit');
  const child = f.chats.getConversation(String(result.conversationId))!;
  const { toolDisplayFragments } = await import('./tool-display');
  const displayed = child.messages.flatMap(message => toolDisplayFragments(message.fragments, false));
  assert.equal(displayed.filter(fragment => 'part' in fragment && fragment.part.pt === 'ph' && fragment.part.pType === 'notice').length, 1);
  assert.equal(displayed.some(fragment => 'part' in fragment && fragment.part.pt === 'error'), false);
});

test('the parent continues the same saved child without repeating completed file writes', async t => {
  const f = await fixture(t);
  f.setProvider(async body => {
    if (body.input.some((item: { type: string }) => item.type === 'function_call_output')) return sse([{ type: 'message', id: 'created-answer', role: 'assistant', content: [], status: 'completed' }]);
    return sse([{ type: 'function_call', id: 'fc-write', call_id: 'saved-write', name: 'folder_write', arguments: '{"folder_id":"repo","path":"created.txt","text":"created once"}', status: 'completed' }]);
  });
  const initial = await f.runSubagent(f.call, f.parent.id, new AbortController().signal);
  const continuation = { id: 'continue-child', name: 'continue_agent', args: JSON.stringify({ conversationId: initial.conversationId, message: 'Verify your earlier work and finish.' }) };
  f.chats.useChatStore.getState()._editConversation(f.parent.id, current => ({ messages: [...current.messages, f.message.createDMessageFromFragments('assistant', [f.fragments.create_FunctionCallInvocation_ContentFragment(continuation.id, continuation.name, continuation.args)])] }));
  await f.disk.flushDisk();
  f.setProvider(async body => {
    const receipts = body.input.filter((item: { type: string }) => item.type === 'function_call_output');
    assert.ok(receipts.some((item: { call_id: string; output: string }) => item.call_id === 'saved-write' && JSON.parse(item.output).created === true));
    assert.equal(body.input.at(-1).content[0].text, 'Verify your earlier work and finish.');
    assert.equal(body.tools.some((tool: { name: string }) => ['spawn_agent', 'continue_agent'].includes(tool.name)), false);
    return sse([{ type: 'message', id: 'continued-answer', role: 'assistant', content: [], status: 'completed' }]);
  });
  const { dispatchLocalTool } = await import('./local-tool-dispatch');
  const result = await dispatchLocalTool(continuation, 'project', f.parent.id, new AbortController().signal);
  assert.equal(result.conversationId, initial.conversationId);
  assert.equal(result.status, 'ok');
  assert.equal(f.chats.useChatStore.getState().conversations.filter(chat => chat.subagent).length, 1);
  const requests = f.requests.length;
  assert.equal((await dispatchLocalTool(continuation, 'project', f.parent.id, new AbortController().signal)).status, 'ok');
  assert.equal(f.requests.length, requests, 'Replaying the same continuation must not start a second run.');
});

test('the child pauses on model inactivity and distinguishes it from a user stop', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  const { SECTOR7_CHAT_EXECUTION } = await import('./runtime-config');
  const previous = SECTOR7_CHAT_EXECUTION.responseIdleTimeoutMs;
  SECTOR7_CHAT_EXECUTION.responseIdleTimeoutMs = 50;
  t.after(() => { SECTOR7_CHAT_EXECUTION.responseIdleTimeoutMs = previous; });
  f.setProvider(async (_body, signal) => new Promise<Response>((_resolve, reject) => {
    assert.ok(signal);
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  const result = await f.runSubagent(f.call, f.parent.id, new AbortController().signal);
  assert.equal(result.status, 'incomplete');
  assert.equal(result.reason, 'idle-timeout');
  assert.equal(result.resumable, true);
  assert.equal(result.stopped, undefined);
  const { hasChatRun } = await import('./chat-run');
  assert.equal(hasChatRun(String(result.conversationId)), false);
  const saved = (await f.serverWorkspace.loadWorkspace(f.directory)).workspace!;
  f.disk.pauseDiskWrites(true); f.chats.useChatStore.setState({ conversations: [] });
  f.disk.installWorkspace(saved); await f.chats.useChatStore.persist.rehydrate(); f.disk.pauseDiskWrites(false);
  assert.equal(f.chats.getConversation(String(result.conversationId))!.lastOutcome, 'incomplete');
  assert.equal(f.chats.getConversation(String(result.conversationId))!.incompleteReason, 'idle-timeout');
});

test('changing results from identical polling calls keep the child running', async t => {
  const f = await fixture(t);
  let round = 0;
  f.setProvider(async () => {
    await writeFile(join(f.directory, 'fact.txt'), `Progress ${round}`);
    if (round === 5) return sse([{ type: 'message', id: 'poll-answer', role: 'assistant', content: [], status: 'completed' }]);
    return sse([{ type: 'function_call', id: `fc-poll-${round}`, call_id: `poll-${round++}`, name: 'folder_read', arguments: '{"folder_id":"repo","path":"fact.txt"}', status: 'completed' }]);
  });
  const result = await f.runSubagent(f.call, f.parent.id, new AbortController().signal);
  assert.equal(result.status, 'ok');
  assert.equal(result.result, 'The project fact is October.');
  assert.equal(result.reason, undefined);
});

test('response activity keeps a child alive beyond the response inactivity window', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  const { SECTOR7_CHAT_EXECUTION } = await import('./runtime-config');
  const previous = SECTOR7_CHAT_EXECUTION.responseIdleTimeoutMs;
  SECTOR7_CHAT_EXECUTION.responseIdleTimeoutMs = 300;
  t.after(() => { SECTOR7_CHAT_EXECUTION.responseIdleTimeoutMs = previous; });
  f.setProvider(async () => {
    const data = await sse([{ type: 'message', id: 'active-answer', role: 'assistant', content: [], status: 'completed' }]).text();
    const packets = data.split('\n\n').filter(Boolean);
    return new Response(new ReadableStream({ async start(controller) {
      for (const packet of packets) {
        controller.enqueue(new TextEncoder().encode(`${packet}\n\n`));
        await new Promise(resolve => setTimeout(resolve, 40));
      }
      controller.close();
    } }), { headers: { 'Content-Type': 'text/event-stream' } });
  });
  const result = await f.runSubagent(f.call, f.parent.id, new AbortController().signal);
  assert.equal(result.status, 'ok');
  assert.equal(result.result, 'The project fact is October.');
});

test('continuation rejects missing, foreign, unsaved and still-running child targets', async t => {
  const f = await fixture(t);
  f.setProvider(async () => sse([{ type: 'message', id: 'ready-answer', role: 'assistant', content: [], status: 'completed' }]));
  const initial = await f.runSubagent(f.call, f.parent.id, new AbortController().signal);
  const { continueSubagent } = await import('./subagents');
  const { acquireChatRun } = await import('./chat-run');
  const continuation = { id: 'protected-continuation', name: 'continue_agent', args: JSON.stringify({ conversationId: initial.conversationId, message: 'Continue.' }) };
  await assert.rejects(continueSubagent({ ...continuation, args: JSON.stringify({ conversationId: 'missing-child', message: 'Continue.' }) }, f.parent.id, new AbortController().signal), /does not belong/);
  await assert.rejects(continueSubagent(continuation, f.parent.id, new AbortController().signal), /not saved/);
  f.chats.useChatStore.getState()._editConversation(f.parent.id, current => ({ messages: [...current.messages, f.message.createDMessageFromFragments('assistant', [f.fragments.create_FunctionCallInvocation_ContentFragment(continuation.id, continuation.name, continuation.args)])] }));
  await f.disk.flushDisk();
  const held = acquireChatRun(String(initial.conversationId));
  try { await assert.rejects(continueSubagent(continuation, f.parent.id, new AbortController().signal), /already running/); }
  finally { held.release(); }
  f.chats.useChatStore.getState()._editConversation(String(initial.conversationId), { subagent: { parentConversationId: 'foreign-parent', invocationId: f.call.id } });
  await assert.rejects(continueSubagent(continuation, f.parent.id, new AbortController().signal), /does not belong/);
});

test('parent and child keep running past five minutes while a local tool executes', async t => {
  const f = await fixture(t);
  f.chats.useChatStore.getState()._editConversation(f.parent.id, current => ({ chatConfig: { ...current.chatConfig, llmId: 'gpt-6.1-sol' }, messages: [current.messages[0]] }));
  const { useAppChatStore } = await import('../../apps/chat/store-app-chat');
  const prior = useAppChatStore.getState().autoTitleChat;
  useAppChatStore.getState().setAutoTitleChat(false);
  t.after(() => { f.disk.pauseDiskWrites(true); useAppChatStore.getState().setAutoTitleChat(prior); });
  await f.disk.flushDisk();
  const originalFetch = globalThis.fetch;
  let advanced = false;
  const start = Date.now();
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/api/local/folders') && !advanced) {
      advanced = true;
      t.mock.method(Date, 'now', () => start + 301000);
    }
    return originalFetch(url, init);
  };
  f.setProvider(async body => {
    const result = body.input.find((item: { type: string }) => item.type === 'function_call_output');
    if (result) return sse([{ type: 'message', id: 'long-parent-answer', role: 'assistant', content: [], status: 'completed' }]);
    if (body.tools.some((tool: { name: string }) => tool.name === 'spawn_agent')) return sse([{ type: 'function_call', id: 'fc-long-spawn', call_id: f.call.id, name: 'spawn_agent', arguments: f.call.args, status: 'completed' }]);
    return sse([{ type: 'function_call', id: 'fc-long-file', call_id: 'long-file', name: 'folder_read', arguments: '{"folder_id":"repo","path":"fact.txt"}', status: 'completed' }]);
  });
  const { runPersonaOnConversationHead } = await import('../../apps/chat/editors/chat-persona');
  assert.equal(await runPersonaOnConversationHead('gpt-6.1-sol', f.parent.id), true);
  assert.equal(advanced, true);
  assert.equal(f.chats.getConversation(f.parent.id)!.lastOutcome, 'ok');
  assert.equal(f.chats.useChatStore.getState().conversations.find(chat => chat.subagent)!.lastOutcome, 'ok');
});

test('a chat launches Sol with inherited tools, reads project files and returns a durable child result', async t => {
  const f = await fixture(t);
  f.setProvider(async body => {
    if (!body.input.some((item: { type: string }) => item.type === 'function_call_output'))
      return sse([{ type: 'function_call', id: 'fc-read', call_id: 'read-fact', name: 'folder_read', arguments: '{"folder_id":"repo","path":"fact.txt"}', status: 'completed' }]);
    const fileResult = body.input.find((item: { type: string }) => item.type === 'function_call_output');
    assert.ok(fileResult?.output?.includes('The project fact is October.'), JSON.stringify(fileResult));
    return sse([{ type: 'message', id: 'answer', role: 'assistant', content: [{ type: 'output_text', text: 'The project fact is October.', annotations: [] }], status: 'completed', phase: 'final_answer' }]);
  });
  const result = await f.runSubagent(f.call, f.parent.id, new AbortController().signal);
  assert.equal(result.model, 'gpt-6.1-sol');
  assert.equal(result.status, 'ok');
  assert.equal(result.result, 'The project fact is October.');
  assert.equal(f.requests.length, 2);
  assert.ok(f.requests.every(body => body.model === 'gpt-6.1-sol' && body.reasoning.effort === 'medium'));
  assert.ok(f.requests.every(body => body.tools.some((tool: { type: string }) => tool.type === 'web_search')));
  assert.ok(f.requests.every(body => body.tools.some((tool: { type: string }) => tool.type === 'code_interpreter')));
  assert.match(f.requests[0].instructions, /PERSONAL_CONTEXT[\s\S]*PROJECT_CONTEXT/);
  assert.equal(f.requests[0].tools.some((tool: { name: string }) => tool.name === 'spawn_agent' || tool.name === 'ask_user_question'), false);
  assert.ok(f.requests[0].tools.some((tool: { type: string; name?: string }) => tool.type === 'function' && tool.name === 'folder_read'));
  const child = f.chats.getConversation(String(result.conversationId))!;
  assert.equal(child.subagent?.parentConversationId, f.parent.id);
  assert.equal(f.projects.useFolderStore.getState().folders[0].conversationIds.includes(child.id), true);
  const saved = (await f.serverWorkspace.loadWorkspace(f.directory)).workspace!;
  f.disk.pauseDiskWrites(true); f.chats.useChatStore.setState({ conversations: [] });
  f.disk.installWorkspace(saved); await f.chats.useChatStore.persist.rehydrate();
  f.disk.pauseDiskWrites(false);
  const restored = f.chats.getConversation(child.id)!;
  assert.equal(restored.chatConfig.llmId, 'gpt-6.1-sol');
  assert.equal(restored.subagent?.invocationId, f.call.id);
  assert.equal(restored.lastOutcome, 'ok');
  assert.equal(restored._abortController, null);
  const again = await f.runSubagent(f.call, f.parent.id, new AbortController().signal);
  assert.equal(again.result, 'The project fact is October.');
  assert.equal(f.chats.useChatStore.getState().conversations.filter(chat => chat.subagent).length, 1);
  assert.equal(f.requests.length, 2);
  const disabledCall = { ...f.call, id: 'spawn-disabled' };
  f.chats.useChatStore.getState()._editConversation(f.parent.id, current => ({
    chatConfig: { ...current.chatConfig, tools: { webSearch: false, webFetch: false, codeSandbox: false } },
    messages: [...current.messages, f.message.createDMessageFromFragments('assistant', [f.fragments.create_FunctionCallInvocation_ContentFragment(disabledCall.id, disabledCall.name, disabledCall.args)])],
  }));
  await f.disk.flushDisk();
  const disabledResult = await f.runSubagent(disabledCall, f.parent.id, new AbortController().signal);
  assert.equal(disabledResult.status, 'ok');
  assert.equal(f.requests.length, 4);
  assert.ok(f.requests.slice(2).every(body => !body.tools.some((tool: { type: string }) => tool.type === 'web_search' || tool.type === 'code_interpreter')));
});

test('Stop cancels the child provider request and preserves an inspectable stopped chat', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  let providerAborted = false;
  f.setProvider(async (_body, signal) => {
    assert.ok(signal);
    started();
    return new Promise<Response>((_resolve, reject) => {
      const abort = () => { providerAborted = true; reject(signal.reason); };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  });
  const controller = new AbortController();
  const running = f.runSubagent(f.call, f.parent.id, controller.signal);
  await ready;
  controller.abort();
  const result = await running;
  assert.equal(result.status, 'stopped');
  assert.equal(result.stopped, true);
  assert.equal(providerAborted, true);
  assert.equal(f.requests.length, 1);
  const child = f.chats.getConversation(String(result.conversationId))!;
  assert.equal(child._abortController, null);
  const { hasChatRun } = await import('./chat-run');
  assert.equal(hasChatRun(child.id), false);
  const saved = (await f.serverWorkspace.loadWorkspace(f.directory)).workspace!;
  f.disk.pauseDiskWrites(true); f.chats.useChatStore.setState({ conversations: [] });
  f.disk.installWorkspace(saved); await f.chats.useChatStore.persist.rehydrate();
  f.disk.pauseDiskWrites(false);
  const restored = f.chats.getConversation(child.id);
  assert.ok(restored);
  assert.equal(restored.lastOutcome, 'stopped');
  assert.equal(restored.subagent?.invocationId, f.call.id);
  assert.equal(restored.chatConfig.llmId, 'gpt-6.1-sol');
  const again = await f.runSubagent(f.call, f.parent.id, new AbortController().signal);
  assert.equal(again.status, 'stopped');
  assert.equal(f.requests.length, 1);
});

test('a parent chat delegates through spawn_agent and resumes with the child result', async t => {
  const f = await fixture(t);
  f.chats.useChatStore.getState()._editConversation(f.parent.id, current => ({
    chatConfig: { ...current.chatConfig, llmId: 'gpt-6.1-sol' },
    messages: [current.messages[0]],
  }));
  await f.disk.flushDisk();
  f.setProvider(async body => {
    if (body.tools.some((tool: { name?: string }) => tool.name === 'spawn_agent')) {
      const result = body.input.find((item: { type: string }) => item.type === 'function_call_output');
      if (!result) return sse([{ type: 'function_call', id: 'fc-spawn', call_id: f.call.id, name: 'spawn_agent', arguments: f.call.args, status: 'completed' }]);
      assert.equal(JSON.parse(result.output).result, 'The project fact is October.');
      return sse([{ type: 'message', id: 'parent-answer', role: 'assistant', content: [{ type: 'output_text', text: 'The project fact is October.', annotations: [] }], status: 'completed', phase: 'final_answer' }]);
    }
    return sse([{ type: 'message', id: 'child-answer', role: 'assistant', content: [{ type: 'output_text', text: 'The project fact is October.', annotations: [] }], status: 'completed', phase: 'final_answer' }]);
  });
  const { runPersonaOnConversationHead } = await import('../../apps/chat/editors/chat-persona');
  const { useAppChatStore } = await import('../../apps/chat/store-app-chat');
  const prior = useAppChatStore.getState().autoTitleChat;
  useAppChatStore.getState().setAutoTitleChat(false);
  t.after(() => { f.disk.pauseDiskWrites(true); useAppChatStore.getState().setAutoTitleChat(prior); });
  assert.equal(await runPersonaOnConversationHead('gpt-6.1-sol', f.parent.id), true);
  const parent = f.chats.getConversation(f.parent.id)!;
  const response = parent.messages.flatMap(message => message.fragments).find(fragment => fragment.ft === 'content' && fragment.part.pt === 'tool_response');
  assert.ok(response && response.ft === 'content' && response.part.pt === 'tool_response');
  const result = JSON.parse(response.part.response.result);
  assert.equal(result.model, 'gpt-6.1-sol');
  assert.equal(result.result, 'The project fact is October.');
  assert.equal(f.chats.getConversation(result.conversationId)?.subagent?.parentConversationId, parent.id);
  assert.equal(parent.lastOutcome, 'ok');
  assert.equal(f.requests.length, 3);
});

test('a subagent request that exceeds context returns a durable error with the reason', async t => {
  const f = await fixture(t);
  const models = await import('~/common/stores/llms/store-llms');
  models.useModelsStore.getState().updateLLM('gpt-6.1-sol', { contextTokens: 1000 });
  f.setProvider(async () => { throw new Error('An over-budget request must not reach the provider.'); });
  const result = await f.runSubagent(f.call, f.parent.id, new AbortController().signal);
  assert.equal(result.status, 'error');
  assert.match(String(result.result), /exceeds the model limit/);
  assert.equal(f.requests.length, 0);
  const saved = (await f.serverWorkspace.loadWorkspace(f.directory)).workspace!;
  f.disk.pauseDiskWrites(true); f.chats.useChatStore.setState({ conversations: [] });
  f.disk.installWorkspace(saved); await f.chats.useChatStore.persist.rehydrate();
  f.disk.pauseDiskWrites(false);
  const restored = f.chats.getConversation(String(result.conversationId));
  assert.ok(restored);
  assert.equal(restored.lastOutcome, 'error');
});

test('a subagent whose file result exceeds follow-up context reports failure instead of a false success', async t => {
  const f = await fixture(t);
  const models = await import('~/common/stores/llms/store-llms');
  models.useModelsStore.getState().updateLLM('gpt-6.1-sol', { contextTokens: 41000 });
  await writeFile(join(f.directory, 'fact.txt'), Array.from({ length: 10000 }, (_, index) => `word${index}`).join(' '));
  f.setProvider(async () => sse([{ type: 'function_call', id: 'fc-large-read', call_id: 'large-read', name: 'folder_read', arguments: '{"folder_id":"repo","path":"fact.txt"}', status: 'completed' }]));
  const result = await f.runSubagent(f.call, f.parent.id, new AbortController().signal);
  assert.equal(result.status, 'error');
  assert.match(String(result.result), /exceeds the model limit/);
  assert.equal(f.requests.length, 1);
});

test('Sol chats and subagents compact at the Sector 7 threshold and resume from durable checkpoints', async t => {
  const f = await fixture(t);
  const { assembleRequest } = await import('./assemble-request');
  const { runPersonaOnConversationHead } = await import('../../apps/chat/editors/chat-persona');
  const compacted = { type: 'compaction', id: 'cmp-latest', encrypted_content: 'fixture-encrypted-context' };
  const childCheckpoint = { type: 'compaction', id: 'cmp-child-latest', encrypted_content: 'fixture-child-encrypted-context' };
  const earlier = { type: 'compaction', id: 'cmp-earlier', encrypted_content: 'fixture-obsolete-context' };
  const answer = { type: 'message', id: 'compact-answer', role: 'assistant', content: [{ type: 'output_text', text: 'The project fact is October.', annotations: [] }], status: 'completed', phase: 'final_answer' };
  f.chats.useChatStore.getState()._editConversation(f.parent.id, current => ({
    chatConfig: { ...current.chatConfig, llmId: 'gpt-6.1-sol' },
    messages: [f.message.createDMessageTextContent('system', 'EDITED_SYSTEM_SENTINEL'), { ...f.message.createDMessageTextContent('user', 'OLD_CONTEXT_SENTINEL'), metadata: { selectedSkills: [{ id: 'retry-skill', origin: 'codex', name: 'Retry skill', revision: 'v1', instructions: 'SELECTED_SKILL_SENTINEL', resources: [] }] } }],
  }));
  const parent = f.chats.getConversation(f.parent.id)!;
  const threshold = await assembleRequest(parent.id, 'gpt-6.1-sol', parent.messages, { estimateFragments: (_llm, role) => role === 'system' ? 0 : 360000, allowOverBudget: true });
  assert.equal(threshold.budget.limit, 400000);
  assert.equal(threshold.budget.fits, true, '360,000 input tokens must reach server-side compaction rather than be blocked by a 10% reserve');
  const oversized = await assembleRequest(parent.id, 'gpt-6.1-sol', parent.messages, { estimateFragments: (_llm, role) => role === 'system' ? 0 : 410000, allowOverBudget: true });
  assert.equal(oversized.budget.fits, false);
  f.setProvider(async body => {
    assert.deepEqual(body.context_management, [{ type: 'compaction', compact_threshold: 360000 }]);
    assert.equal(body.store, false);
    return sse([earlier, answer, compacted], 'gpt-6.1-sol-2026-09-29');
  });
  assert.equal(await runPersonaOnConversationHead('gpt-6.1-sol', parent.id), true);
  const call = { ...f.call, id: 'compact-child' };
  f.chats.useChatStore.getState()._editConversation(parent.id, current => ({ messages: [...current.messages,
    f.message.createDMessageFromFragments('assistant', [f.fragments.create_FunctionCallInvocation_ContentFragment(call.id, call.name, call.args)])] }));
  let childStep = 0;
  f.setProvider(async body => {
    assert.deepEqual(body.context_management, [{ type: 'compaction', compact_threshold: 360000 }]);
    if (!childStep++) return sse([earlier, { type: 'function_call', id: 'fc-compact-read', call_id: 'compact-read', name: 'folder_read', arguments: '{"folder_id":"repo","path":"fact.txt"}', status: 'completed' }]);
    assert.deepEqual(body.input.map((item: { type: string }) => item.type), ['compaction', 'function_call', 'function_call_output']);
    assert.equal(body.input[0].id, 'cmp-earlier');
    assert.equal(body.input[1].call_id, 'compact-read');
    assert.equal(body.input[2].call_id, 'compact-read');
    assert.match(body.input[2].output, /The project fact is October/);
    return sse([answer, childCheckpoint]);
  });
  const childResult = await f.runSubagent(call, parent.id, new AbortController().signal);
  assert.equal(childResult.status, 'ok');
  f.chats.useChatStore.getState()._editConversation(parent.id, current => ({ messages: current.messages.map(message => message.fragments.some(fragment => 'part' in fragment && fragment.part.pt === 'tool_invocation' && fragment.part.id === call.id) ? { ...message, fragments: [...message.fragments, f.fragments.create_FunctionCallResponse_ContentFragment(call.id, false, 'spawn_agent', JSON.stringify(childResult), 'client')] } : message) }));
  await f.disk.flushDisk();
  const saved = (await f.serverWorkspace.loadWorkspace(f.directory)).workspace!;
  f.disk.pauseDiskWrites(true); f.chats.useChatStore.setState({ conversations: [] });
  f.disk.installWorkspace(saved); await f.chats.useChatStore.persist.rehydrate(); f.disk.pauseDiskWrites(false);
  f.setProvider(async body => {
    assert.equal(body.input[0].type, 'compaction');
    const isParent = body.tools.some((tool: { name?: string }) => tool.name === 'spawn_agent');
    assert.equal(body.input[0].id, isParent ? 'cmp-latest' : 'cmp-child-latest');
    assert.equal(body.input[0].encrypted_content, isParent ? 'fixture-encrypted-context' : 'fixture-child-encrypted-context');
    assert.equal(body.input.some((item: { id?: string }) => item.id === 'cmp-earlier' || item.id === 'compact-answer'), false);
    const invocation = body.input.findIndex((item: { call_id?: string }) => item.call_id === 'compact-child');
    if (isParent) {
      assert.ok(invocation >= 0);
      assert.equal(body.input[invocation].type, 'function_call');
      assert.equal(body.input[invocation + 1].type, 'function_call_output');
      assert.equal(body.input[invocation + 1].call_id, 'compact-child');
      assert.match(body.input[invocation + 1].output, /The project fact is October/);
    } else assert.deepEqual(body.input.map((item: { type: string }) => item.type), ['compaction', 'message']);
    assert.equal(body.input.at(-1).content[0].text, 'Continue after compaction.');
    assert.equal(JSON.stringify(body.input).includes('OLD_CONTEXT_SENTINEL'), false);
    assert.match(body.instructions, /PERSONAL_CONTEXT[\s\S]*PROJECT_CONTEXT/);
    return sse([answer]);
  });
  for (const id of [parent.id, String(childResult.conversationId)]) {
    f.chats.useChatStore.getState()._editConversation(id, current => ({ messages: [...current.messages, f.message.createDMessageTextContent('user', 'Continue after compaction.')] }));
    assert.equal(await runPersonaOnConversationHead('gpt-6.1-sol', id), true);
  }
  assert.equal(f.chats.getConversation(parent.id)!.messages[1].role, 'user');
  assert.match(f.message.messageFragmentsReduceText(f.chats.getConversation(parent.id)!.messages[1].fragments), /OLD_CONTEXT_SENTINEL/);
  const models = await import('~/common/stores/llms/store-llms');
  models.useModelsStore.setState({ llms: [...models.useModelsStore.getState().llms, { ...models.findLLMOrThrow('gpt-6.1-sol'), id: 'claude-opus-5-5', vId: 'anthropic' }] });
  const switched = await assembleRequest(parent.id, 'claude-opus-5-5', f.chats.getConversation(parent.id)!.messages);
  assert.match(JSON.stringify(switched.messages), /OLD_CONTEXT_SENTINEL/);
  assert.doesNotMatch(JSON.stringify({ system: switched.system, messages: switched.messages }), /fixture-encrypted-context|cmp-latest/);
  const { env } = await import('~/server/env.server');
  const originalHost = env.OPENAI_API_HOST;
  t.after(() => { Object.defineProperty(env, 'OPENAI_API_HOST', { value: originalHost, configurable: true }); });
  Object.defineProperty(env, 'OPENAI_API_HOST', { value: 'https://gateway.example.test/other-openai', configurable: true });
  const hostRequestStart = f.requests.length;
  f.setProvider(async body => {
    assert.equal(body.input.some((item: { type: string }) => item.type === 'compaction'), false);
    assert.match(JSON.stringify(body.input), /OLD_CONTEXT_SENTINEL/);
    assert.match(body.instructions, /EDITED_SYSTEM_SENTINEL/);
    assert.equal(JSON.stringify(body.input).split('SELECTED_SKILL_SENTINEL').length - 1, 1);
    return sse([answer, { type: 'compaction', id: 'cmp-new-connection', encrypted_content: 'fixture-new-connection-context' }], 'gpt-6.1-sol-2026-09-29');
  });
  assert.equal(await runPersonaOnConversationHead('gpt-6.1-sol', parent.id), true);
  assert.equal(f.requests.length - hostRequestStart, 1);
  f.setProvider(async body => {
    assert.equal(body.input[0].id, 'cmp-new-connection');
    return sse([answer]);
  });
  f.chats.useChatStore.getState()._editConversation(parent.id, current => ({ messages: [...current.messages, f.message.createDMessageTextContent('user', 'Continue on new connection.')] }));
  assert.equal(await runPersonaOnConversationHead('gpt-6.1-sol', parent.id), true);
  const originalKey = env.OPENAI_API_KEY;
  t.after(() => { Object.defineProperty(env, 'OPENAI_API_KEY', { value: originalKey, configurable: true }); });
  Object.defineProperty(env, 'OPENAI_API_KEY', { value: 'fixture-different-account-key', configurable: true });
  const keyRequestStart = f.requests.length;
  f.setProvider(async body => {
    assert.equal(body.input.some((item: { type: string }) => item.type === 'compaction'), false);
    assert.match(body.instructions, /EDITED_SYSTEM_SENTINEL/);
    assert.match(JSON.stringify(body.input), /OLD_CONTEXT_SENTINEL/);
    assert.equal(JSON.stringify(body.input).split('SELECTED_SKILL_SENTINEL').length - 1, 1);
    return sse([answer]);
  });
  assert.equal(await runPersonaOnConversationHead('gpt-6.1-sol', parent.id), true);
  assert.equal(f.requests.length - keyRequestStart, 1);
  Object.defineProperty(env, 'OPENAI_API_KEY', { value: originalKey, configurable: true });
  f.chats.useChatStore.getState()._editConversation(parent.id, current => ({ messages: current.messages.map((message, index) => index !== 1 ? message : { ...message, fragments: [f.fragments.createTextContentFragment('EDITED_CONTEXT_SENTINEL')] }) }));
  f.setProvider(async body => {
    assert.equal(body.input.some((item: { type: string }) => item.type === 'compaction'), false);
    assert.match(JSON.stringify(body.input), /EDITED_CONTEXT_SENTINEL/);
    return sse([answer]);
  });
  assert.equal(await runPersonaOnConversationHead('gpt-6.1-sol', parent.id), true);
});

test('enabled project agent folders contribute model-matching instructions to chats and Sol children', async t => {
  const f = await fixture(t);
  const { mkdir } = await import('node:fs/promises');
  const { assembleRequest } = await import('./assemble-request');
  await mkdir(join(f.directory, '.codex'), { recursive: true });
  await mkdir(join(f.directory, '.claude'), { recursive: true });
  await writeFile(join(f.directory, '.codex', 'AGENTS.md'), 'LOCAL_CODEX_CONTEXT');
  await writeFile(join(f.directory, '.claude', 'CLAUDE.md'), 'LOCAL_CLAUDE_CONTEXT');
  f.projects.useFolderStore.getState().updateProject('project', { connectedFolders: [{ id: 'repo', name: 'repo', path: f.directory, agentFolders: { codex: true, claude: true } }] });
  await f.disk.flushDisk();
  const models = await import('~/common/stores/llms/store-llms');
  models.useModelsStore.setState({ llms: [...models.useModelsStore.getState().llms, { ...models.findLLMOrThrow('gpt-6.1-sol'), id: 'claude-opus-5-5', vId: 'anthropic' }] });
  const parent = await assembleRequest(f.parent.id, 'claude-opus-5-5', f.parent.messages);
  assert.match(JSON.stringify(parent.system), /LOCAL_CLAUDE_CONTEXT/);
  assert.doesNotMatch(JSON.stringify(parent.system), /LOCAL_CODEX_CONTEXT/);
  f.setProvider(async body => {
    assert.match(body.instructions, /LOCAL_CODEX_CONTEXT/);
    assert.doesNotMatch(body.instructions, /LOCAL_CLAUDE_CONTEXT/);
    return sse([{ type: 'message', id: 'project-answer', role: 'assistant', content: [{ type: 'output_text', text: 'The project fact is October.', annotations: [] }], status: 'completed' }]);
  });
  const child = await f.runSubagent(f.call, f.parent.id, new AbortController().signal);
  assert.equal(child.status, 'ok');
  f.projects.useFolderStore.getState().updateProject('project', { connectedFolders: [{ id: 'repo', name: 'repo', path: f.directory, agentFolders: { codex: false, claude: false } }] });
  await f.disk.flushDisk();
  const disabled = await assembleRequest(f.parent.id, 'claude-opus-5-5', f.parent.messages);
  assert.doesNotMatch(JSON.stringify(disabled.system), /LOCAL_CLAUDE_CONTEXT|LOCAL_CODEX_CONTEXT/);
});
