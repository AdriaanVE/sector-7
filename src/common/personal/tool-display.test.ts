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

test('activity labels use current phase and concise filenames, not command output or stale calls', () => {
  const read = create_FunctionCallInvocation_ContentFragment('call', 'folder_read', '{"path":"/some/private/root/README.md"}');
  const command = create_FunctionCallInvocation_ContentFragment('call', 'local_command', '{"command":"secret command"}');
  assert.equal(toolActivityLabel([read], 'Reading files'), 'Reading README.md');
  assert.equal(toolActivityLabel([read], 'Thinking'), 'Thinking');
  assert.equal(toolActivityLabel([command], 'Running command'), 'Running a command');
  if (read.part.pt === 'tool_invocation' && read.part.invocation.type === 'function_call') read.part.invocation.args = '{'; assert.equal(toolActivityLabel([read], 'Reading files'), 'Reading files');
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
  assert.equal(toolActivityLabel([progress], 'Searching'), 'Searching: Neon Tokyo');
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
