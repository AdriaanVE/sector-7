import { test } from 'node:test';
import assert from 'node:assert/strict';
import { create_FunctionCallInvocation_ContentFragment, create_FunctionCallResponse_ContentFragment, createTextContentFragment, createPlaceholderVoidFragment } from '~/common/stores/chat/chat.fragments';
import { emptyWorkspace, validateWorkspace } from './workspace-schema';
import { completedToolSummary, hasVisibleAnswer, toolActivityLabel, toolDisplayFragments } from './tool-display';

test('tool display hides details without changing replay history, answers or resources', () => {
  const fragments = [create_FunctionCallInvocation_ContentFragment('call', 'folder_read', '{"path":"README.md"}'), create_FunctionCallResponse_ContentFragment('call', false, 'folder_read', '{"text":"private output"}', 'client'), createTextContentFragment('Answer with a source link.')];
  const original = JSON.stringify(fragments);
  assert.deepEqual(toolDisplayFragments(fragments, false), [fragments[2]]);
  assert.deepEqual(toolDisplayFragments(fragments, true), fragments);
  assert.equal(JSON.stringify(fragments), original);
  assert.equal(hasVisibleAnswer(toolDisplayFragments(fragments.slice(0, 2), false)), false);
  assert.equal(hasVisibleAnswer(toolDisplayFragments(fragments, false)), true);
});

test('hidden tool errors and warning notices remain visible without dumping tool payloads', () => {
  const failure = create_FunctionCallResponse_ContentFragment('call', 'Read failed', 'folder_read', '{"details":"large sensitive output"}', 'client');
  const notice = createPlaceholderVoidFragment('Retrying', 'notice');
  const progress = createPlaceholderVoidFragment('Working');
  const shown = toolDisplayFragments([failure, notice, progress], false, true);
  assert.ok('part' in shown[0]); assert.equal(shown[0].part.pt, 'error'); assert.equal(JSON.stringify(shown).includes('large sensitive output'), false);
  assert.equal(shown[1], notice); assert.equal(shown.length, 2);
});

const folders = [{ id: 'root', name: 'sector-7' }, { id: 'other', name: 'shared-tools' }];
const call = (id: string, name: string, args: Record<string, unknown>) => create_FunctionCallInvocation_ContentFragment(id, name, JSON.stringify(args));

test('activity labels show file paths and search context in the actual connected folder', () => {
  const read = call('read', 'folder_read', { folder_id: 'root', path: 'src/common/personal/tool-display.ts' });
  assert.equal(toolActivityLabel([read], 'Reading files', { folders }), 'Reading sector-7/src/common/personal/tool-display.ts');
  const search = call('search', 'folder_search', { folder_id: 'other', path: 'src', query: 'activity\n\u202elabel' });
  assert.equal(toolActivityLabel([search], 'Searching', { folders }), 'Searching shared-tools/src: activity label');
  const query = 'long query '.repeat(23).trim();
  const path = 'nested/'.repeat(40) + 'activity.ts';
  const long = call('long', 'folder_search', { folder_id: 'root', path, query });
  assert.equal(toolActivityLabel([long], 'Searching', { folders }), `Searching sector-7/${path}: ${query}`);
  assert.equal(toolActivityLabel([read], 'Thinking', { folders }), 'Thinking');
  const oversized = call('oversized', 'folder_search', { folder_id: 'root', path: 'p'.repeat(3000), query: 'q'.repeat(500) });
  assert.equal(toolActivityLabel([oversized], 'Searching', { folders }), `Searching sector-7/${'p'.repeat(2048)}: ${'q'.repeat(256)}`);
});

test('activity selection retains the exact current invocation during multiple calls', () => {
  const read = call('read', 'folder_read', { folder_id: 'root', path: 'README.md' });
  const newer = call('newer', 'folder_read', { folder_id: 'other', path: 'newer.md' });
  const command = call('command', 'local_command', { folder_id: 'root', command: 'npm test' });
  assert.equal(toolActivityLabel([read, newer, command], 'Reading files', { folders, toolId: 'read' }), 'Reading sector-7/README.md');
  assert.equal(toolActivityLabel([read, newer, command], 'Reading files', { folders, toolId: 'missing' }), 'Reading files');
  assert.equal(toolActivityLabel([read, newer, command], 'Reading files', { folders }), 'Reading shared-tools/newer.md');
  assert.equal(toolActivityLabel([read], 'Searching', { folders }), 'Searching');
});

test('partial or malformed arguments fall back without showing payloads or absolute paths', () => {
  for (const args of ['{', 'null', '[]', 'true', '{"path":12}', '{"path":"/private/root/secret.txt"}']) {
    const read = create_FunctionCallInvocation_ContentFragment('read', 'folder_read', args);
    assert.equal(toolActivityLabel([read], 'Reading files'), 'Reading files');
  }
  const partial = call('partial', 'folder_search', { folder_id: 'root' });
  assert.equal(toolActivityLabel([partial], 'Searching', { folders }), 'Searching sector-7');
  const move = call('move', 'folder_move', { folder_id: 'root', path: 'src/old.ts', destination: 'src/new.ts' });
  assert.equal(toolActivityLabel([move], 'Editing files', { folders }), 'Moving sector-7/src/old.ts to src/new.ts');
});

test('shell labels show fixed safe tasks and working folder while excluding secrets and arbitrary arguments', () => {
  for (const command of ['npm test --token secret-value', 'git diff -- private-secret', 'npm run lint -- --key=secret-value']) {
    const label = toolActivityLabel([call('command', 'local_command', { folder_id: 'root', command })], 'Running command', { folders });
    assert.ok(label.startsWith('Running '));
    assert.ok(label.endsWith(' in sector-7'));
    assert.equal(label.includes('secret'), false);
    assert.equal(label.includes('--'), false);
  }
  for (const command of ['API_KEY=secret-value npm test', 'echo secret-value', 'npm run secret-value', 'npm test; echo secret-value', 'npm test $(echo secret-value)', 'npm test\nsecret-value', 'python -c "secret-value"']) {
    assert.equal(toolActivityLabel([call('command', 'local_command', { folder_id: 'other', command })], 'Running command', { folders }), 'Running a command in shared-tools');
  }
  assert.equal(toolActivityLabel([call('command', 'local_command', { folder_id: 'root', command: 'npm run tscheck' })], 'Running command', { folders }), 'Running npm run tscheck in sector-7');
});

test('tool setting is backwards compatible in disk envelopes and validates booleans', () => {
  const workspace = emptyWorkspace();
  workspace.stores['app-personal-settings'] = { version: 1, state: { instructions: '' } };
  assert.doesNotThrow(() => validateWorkspace(workspace));
  workspace.stores['app-personal-settings'].state.showToolCalls = true;
  assert.equal(validateWorkspace(workspace).stores['app-personal-settings']?.state.showToolCalls, true);
  workspace.stores['app-personal-settings'].state.showToolCalls = 'true';
  assert.throws(() => validateWorkspace(workspace));
});

test('native search progress is concise while annotations and resources remain visible', () => {
  const progress = createPlaceholderVoidFragment('Searching', undefined, undefined, [{ opId: 'search', mot: 'search-web', text: 'Searching', state: 'active', iTexts: ['Neon\nTokyo'], level: 0, cts: 1 }]);
  assert.equal(toolActivityLabel([progress], 'Searching'), 'Searching the web: Neon Tokyo');
  assert.equal(hasVisibleAnswer(toolDisplayFragments([createTextContentFragment('   ')], false)), false);
  const failed = createPlaceholderVoidFragment('Search failed', undefined, undefined, [{ opId: 'search', mot: 'search-web', text: 'Search unavailable', state: 'error', level: 0, cts: 1 }]);
  const projected = toolDisplayFragments([failed], false)[0]; assert.ok('part' in projected); assert.equal(projected.part.pt, 'error');
});

test('ordinary progress remains outside the active chat flow and projected failures are detached', () => {
  const placeholder = createPlaceholderVoidFragment('Creating image');
  assert.equal(toolDisplayFragments([placeholder], false)[0], placeholder);
  assert.equal(hasVisibleAnswer(toolDisplayFragments([placeholder], false)), true);
  assert.deepEqual(toolDisplayFragments([placeholder], false, true), []);
  const original = create_FunctionCallResponse_ContentFragment('failure', 'Original error', 'folder_read', '{}', 'client');
  const display = toolDisplayFragments([original], false)[0];
  assert.notEqual(display.fId, original.fId);
  assert.ok('part' in display); assert.equal(display.part.pt, 'error');
  if (display.part.pt === 'error') assert.equal(display.part.hint, 'tool-display');
});

test('native activity shows search queries and fetch URLs, preserving the current operation', () => {
  const progress = createPlaceholderVoidFragment('Working', undefined, undefined, [
    { opId: 'search', mot: 'search-web', text: 'Searching the web...', state: 'active', iTexts: ['Search query: "React activity labels"'], level: 0, cts: 1 },
    { opId: 'fetch', mot: 'search-web', text: 'Fetching web page...', state: 'active', iTexts: ['URL: https://user:secret@example.com/docs/activity?token=secret#secret'], level: 0, cts: 2 },
  ]);
  assert.equal(toolActivityLabel([progress], 'Searching', { toolId: 'search' }), 'Searching the web: React activity labels');
  assert.equal(toolActivityLabel([progress], 'Searching', { toolId: 'fetch' }), 'Fetching https://example.com/docs/activity');
  assert.equal(toolActivityLabel([progress], 'Searching', { toolId: 'missing' }), 'Searching');
  assert.equal(toolActivityLabel([call('fetch', 'web_fetch', { url: 'https://example.com/api?secret=123' })], 'Searching'), 'Fetching https://example.com/api');
  assert.equal(toolActivityLabel([call('fetch', 'web_fetch', { url: 'javascript:secret' })], 'Searching'), 'Fetching a web page');
});


const response = (id: string, name: string, result: Record<string, unknown> = {}, error: boolean | string = false) => create_FunctionCallResponse_ContentFragment(id, error, name, JSON.stringify(result), 'client');

test('completed summary deduplicates recorded activities and never exposes tool inputs or results', () => {
  const fragments = [
    call('read', 'folder_read', { path: '/secret/private-file', token: 'secret-token' }),
    response('read', 'folder_read', { text: 'private output' }), response('read2', 'folder_read'),
    response('command', 'local_command', { status: 'succeeded', chunks: [{ text: 'private output' }] }),
    response('web', 'web_search'), response('web2', 'web_search'),
    createTextContentFragment('I also generated an image and deleted files.'),
  ];
  const before = JSON.stringify(fragments);
  assert.equal(completedToolSummary(fragments), 'Read files, ran commands, searched the web');
  assert.equal(JSON.stringify(fragments), before);
  assert.equal(completedToolSummary(fragments, true), null);
  assert.equal(completedToolSummary(fragments, false, true), null);
  assert.equal(completedToolSummary([]), null);
  assert.equal(completedToolSummary([fragments[6]]), null);
  assert.equal(completedToolSummary([call('question', 'ask_user_question', {}), response('question', 'ask_user_question')]), null);
});

test('completed summary distinguishes failure, cancellation and unconfirmed invocations', () => {
  assert.equal(completedToolSummary([call('read', 'folder_read', {})]), 'File reads incomplete');
  assert.equal(completedToolSummary([response('read', 'folder_read', {}, 'Sensitive failure text')]), 'File reads failed');
  assert.equal(completedToolSummary([response('command', 'local_command', { status: 'failed', exitCode: 1 })]), 'Commands failed');
  assert.equal(completedToolSummary([response('command', 'local_command', { status: 'cancelled' })]), 'Commands stopped');
  assert.equal(completedToolSummary([response('command', 'local_command', { error: 'aborted', stopped: true }, 'aborted')]), 'Commands stopped');
  for (const status of ['running', undefined]) assert.equal(completedToolSummary([response('command', 'local_command', { status })]), 'Commands incomplete');
  for (const status of ['timed_out', 'output_limit']) assert.equal(completedToolSummary([response('command', 'local_command', { status })]), 'Commands failed');
  const invocation = call('read', 'folder_read', {});
  const result = response('read', 'folder_read');
  assert.equal(completedToolSummary([invocation, result]), 'Read files');
  assert.equal(completedToolSummary([result, invocation]), 'Read files');
  assert.equal(completedToolSummary([result, response('other', 'folder_read', {}, true)]), 'Read files, file reads failed');
});

test('completed summary supports native logs, including fetches and interrupted work', () => {
  const fragments = [createPlaceholderVoidFragment('Working', undefined, undefined, [
    { opId: 'search', mot: 'search-web', text: 'Search completed: 2 results', state: 'done', iTexts: ['private query'], level: 0, cts: 1 },
    { opId: 'fetch', mot: 'search-web', text: 'Retrieved https://private.example/secret', state: 'done', iTexts: ['https://private.example/secret'], level: 0, cts: 1 },
    { opId: 'fetch2', mot: 'search-web', text: 'Fetch error: unavailable', state: 'error', level: 0, cts: 1 },
    { opId: 'code', mot: 'code-exec', text: 'Code executed', state: 'done', oTexts: ['private result'], level: 0, cts: 1 },
    { opId: 'bash', mot: 'code-exec', text: 'Bash executed', state: 'done', level: 0, cts: 1 },
    { opId: 'stop', mot: 'search-web', text: 'Searching', state: 'error', oTexts: ['Terminated with reason: done-client-aborted'], level: 0, cts: 1 },
    { opId: 'pending', mot: 'code-exec', text: 'Executing code...', state: 'active', level: 0, cts: 1 },
  ])];
  const before = JSON.stringify(fragments);
  assert.equal(completedToolSummary(fragments), 'Searched the web, fetched web pages, web fetch failed, ran code, ran commands, web search stopped, code execution incomplete');
  assert.equal(JSON.stringify(fragments), before);
});

test('completed summary covers local operations and treats unknown tools generically', () => {
  const names = ['folder_list', 'folder_search', 'folder_write', 'folder_edit', 'folder_move', 'folder_delete', 'web_fetch', 'code_execution', 'secret_tool_name'];
  assert.equal(completedToolSummary(names.map(name => response(name, name))), 'Listed files, searched files, updated files, moved files, deleted files, fetched web pages, ran code, used tools');
  const logs = createPlaceholderVoidFragment('Working', undefined, undefined, [
    { opId: 'view', mot: 'code-exec', text: 'Viewed file', state: 'done', level: 0, cts: 1 },
    { opId: 'edit', mot: 'code-exec', text: 'Edit applied', state: 'done', level: 0, cts: 1 },
    { opId: 'unknown', mot: 'code-exec', text: 'Using secret_tool_name...', state: 'done', level: 0, cts: 1 },
    { opId: 'image', mot: 'gen-image', text: 'Finished', state: 'done', level: 0, cts: 1 },
  ]);
  assert.equal(completedToolSummary([logs]), 'Read files, updated files, used tools, generated images');
});


for (const streaming of [true, false]) test(`native ${streaming ? 'SSE' : 'JSON'} summary survives clean parser completion without progress placeholders`, async () => {
  const { ContentReassembler } = await import('~/modules/aix/client/ContentReassembler');
  const { ChatGenerateTransmitter } = await import('~/modules/aix/server/dispatch/chatGenerate/ChatGenerateTransmitter');
  const { createAnthropicMessageParser, createAnthropicMessageParserNS } = await import('~/modules/aix/server/dispatch/chatGenerate/parsers/anthropic.parser');
  const content = [
    { type: 'server_tool_use', id: 'search', name: 'web_search', input: { query: 'secret query' } },
    { type: 'web_search_tool_result', tool_use_id: 'search', content: [{ type: 'web_search_result', title: 'Secret', url: 'https://example.com/secret', encrypted_content: 'unchanged-encrypted' }] },
    { type: 'server_tool_use', id: 'fetch', name: 'web_fetch', input: { url: 'https://example.com/private' } },
    { type: 'web_fetch_tool_result', tool_use_id: 'fetch', content: { type: 'web_fetch_tool_result_error', error_code: 'unavailable' } },
    { type: 'text', text: 'Answer' },
  ];
  const pt = new ChatGenerateTransmitter('Anthropic');
  const model = 'claude-sonnet-5-5';
  if (streaming) {
    const parse = createAnthropicMessageParser({ deployment: 'test', model, requestPrefix: 'preserved' });
    parse(pt, JSON.stringify({ type: 'message_start', message: { id: 'native', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } }), 'message_start');
    for (const [index, block] of content.entries()) {
      parse(pt, JSON.stringify({ type: 'content_block_start', index, content_block: block }), 'content_block_start');
      parse(pt, JSON.stringify({ type: 'content_block_stop', index }), 'content_block_stop');
    }
    parse(pt, JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } }), 'message_delta');
    parse(pt, JSON.stringify({ type: 'message_stop' }), 'message_stop');
  } else createAnthropicMessageParserNS({ deployment: 'test', model, requestPrefix: 'preserved' })(pt, JSON.stringify({ id: 'native', type: 'message', role: 'assistant', model, content, stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 5 } }));
  const reassembler = new ContentReassembler({ mgt: 'aix', name: model, aix: { mId: model, vId: 'anthropic' } }, undefined, undefined, []);
  if (!pt.isEnded) pt.setDialectEnded('done-dialect');
  for (const particle of pt.flushParticles()) reassembler.enqueueWireParticle(particle);
  await reassembler.waitForWireComplete();
  const result = reassembler.finalizeReassembly();
  assert.equal(result.fragments.some(fragment => fragment.part.pt === 'ph'), false);
  const before = JSON.stringify(result.generator.nativeHistory);
  assert.equal(completedToolSummary(result.fragments, false, false, result.generator.nativeHistory), 'Searched the web, web fetch failed');
  assert.equal(JSON.stringify(result.generator.nativeHistory), before);
  assert.deepEqual(result.generator.nativeHistory?.segments[0].content, content);
  const history = result.generator.nativeHistory!;
  const continued = { ...history, segments: [...history.segments, { id: 'continuation', content: [
    { type: 'server_tool_use', id: 'bash', name: 'bash_code_execution', input: { command: 'secret command' } },
    { type: 'bash_code_execution_tool_result', tool_use_id: 'bash', content: { type: 'bash_code_execution_result', return_code: 1, stdout: '', stderr: '' } },
    { type: 'server_tool_use', id: 'pending', name: 'web_fetch', input: { url: 'https://example.com/private' } },
  ] }] };
  assert.equal(completedToolSummary(result.fragments, false, false, continued), 'Searched the web, web fetch failed, commands failed, web fetch incomplete');
});

test('native in-progress labels retain command, code and editor categories after stopping', () => {
  const logs = createPlaceholderVoidFragment('Stopped', undefined, undefined, [
    { opId: 'bash', mot: 'code-exec', text: 'Running bash', state: 'error', oTexts: ['Terminated with reason: done-client-aborted'], level: 0, cts: 1 },
    { opId: 'code', mot: 'code-exec', text: 'Running code', state: 'error', oTexts: ['Terminated with reason: done-client-aborted'], level: 0, cts: 1 },
    { opId: 'editor', mot: 'code-exec', text: 'Editor error', state: 'error', level: 0, cts: 1 },
  ]);
  assert.equal(completedToolSummary([logs]), 'Commands stopped, code execution stopped, file updates failed');
});
