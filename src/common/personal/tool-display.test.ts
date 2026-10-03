import { test } from 'node:test';
import assert from 'node:assert/strict';
import { create_FunctionCallInvocation_ContentFragment, create_FunctionCallResponse_ContentFragment, createTextContentFragment, createPlaceholderVoidFragment } from '~/common/stores/chat/chat.fragments';
import { emptyWorkspace, validateWorkspace } from './workspace-schema';
import { hasVisibleAnswer, toolActivityLabel, toolDisplayFragments } from './tool-display';

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
