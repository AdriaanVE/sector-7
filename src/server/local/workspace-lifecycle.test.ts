import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, utimes, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyWorkspace, validateWorkspace } from '~/common/personal/workspace-schema';
import { createDConversation } from '~/common/stores/chat/chat.conversation';
import { createDMessageFromFragments } from '~/common/stores/chat/chat.message';
import { create_FunctionCallInvocation_ContentFragment } from '~/common/stores/chat/chat.fragments';
import { nativeHistoryProjection } from '~/common/personal/native-history';
import { commitWorkspace, writeAsset, loadWorkspace, backupWorkspace, restoreWorkspace } from './workspace';

function fixture() {
  const workspace = emptyWorkspace();
  const { _abortController, ...chat } = createDConversation();
  chat.isArchived = true; chat.userTitle = 'Lifecycle chat';
  const image = createDMessageFromFragments('user', [{ ft: 'content', fId: 'image', part: { pt: 'image_ref', dataRef: { reftype: 'dblob', dblobAssetId: 'binary-original', mimeType: 'image/png', bytesSize: 5 } } }]);
  const question = createDMessageFromFragments('assistant', [create_FunctionCallInvocation_ContentFragment('question', 'ask_user_question', JSON.stringify({ questions: [{ id: 'choice', text: 'Keep this?' }] }))]);
  question.generator = { mgt: 'aix', name: 'Claude', aix: { vId: 'anthropic', mId: chat.chatConfig.llmId }, nativeHistory: {
    provider: 'anthropic-messages', deployment: 'test', model: chat.chatConfig.llmId, projection: nativeHistoryProjection(question.fragments), segments: [{ id: 'native', content: [{ type: 'tool_use', id: 'question', name: 'ask_user_question', input: { questions: [{ id: 'choice', text: 'Keep this?' }] } }] }],
  } };
  chat.messages = [image, question]; chat.lastCompletedMessageId = question.id; chat.lastSeenMessageId = image.id;
  chat.pendingQuestions = [{ invocationId: 'question', messageId: question.id, model: chat.chatConfig.llmId, questions: [{ id: 'choice', text: 'Keep this?' }] }];
  workspace.stores['app-chats'] = { version: 5, state: { conversations: [chat] } };
  workspace.stores['app-folders'] = { version: 1, state: { enableFolders: true, folders: [
    { id: 'empty-project', title: 'Empty project', instructions: 'Shared instructions', revision: 2, fileIds: [], conversationIds: [], connectedFolders: [{ id: 'live-folder', name: 'Repository', path: '/private/tmp/repository' }] },
    { id: 'chat-project', title: 'Chat project', instructions: '', revision: 1, fileIds: [], conversationIds: [chat.id] },
  ] } };
  workspace.assets['binary-original'] = { size: 5, mime: 'image/png', metadata: { createdAt: '2026-10-04T01:00:00.000Z', metadata: { mimeType: 'image/png' } } };
  return workspace;
}

test('complete workspace survives disk reload and ZIP restore including empty projects, archive and pending attention', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'sector7-lifecycle-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bytes = new Uint8Array([0, 255, 128, 13, 10]);
  const workspace = fixture(); await writeAsset('binary-original', bytes, directory);
  const saved = JSON.parse(JSON.stringify(await commitWorkspace(workspace, 0, directory)));
  assert.deepEqual((await loadWorkspace(directory)).workspace, saved);
  const archive = await backupWorkspace(directory); const target = await mkdtemp(join(tmpdir(), 'sector7-lifecycle-restore-'));
  t.after(() => rm(target, { recursive: true, force: true }));
  const previous = await commitWorkspace(emptyWorkspace(), 0, target);
  const restored = await restoreWorkspace(archive, previous.revision, target);
  const normalized = { ...restored, revision: saved.revision, revisionEpoch: saved.revisionEpoch };
  assert.deepEqual(JSON.parse(JSON.stringify(normalized)), saved);
  assert.deepEqual(new Uint8Array(await readFile(join(target, 'assets', 'binary-original'))), bytes);
  const actualChats = restored.stores['app-chats']!.state.conversations;
  const actualProjects = restored.stores['app-folders']!.state.folders;
  assert.deepEqual(actualChats, workspace.stores['app-chats']!.state.conversations);
  assert.deepEqual(actualProjects, workspace.stores['app-folders']!.state.folders);
  assert.ok((await readdir(target)).some(name => name.startsWith('workspace.recovery-')));
  const withCredential = structuredClone(workspace); withCredential.stores['app-personal-settings'] = { version: 1, state: { instructions: '', apiKey: 'fixture-secret' } };
  await assert.rejects(commitWorkspace(withCredential, restored.revision, target, restored.revisionEpoch), /Unexpected durable field|credential/);
  assert.deepEqual((await loadWorkspace(target)).workspace, restored);
});

test('corrupt recovery manifests prevent GC, last-good owns originals, and failed saves preserve primary and bytes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'sector7-lifecycle-gc-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeAsset('binary-original', new Uint8Array([0, 255, 128, 13, 10]), directory);
  const first = await commitWorkspace(fixture(), 0, directory);
  const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
  await utimes(join(directory, 'assets', 'binary-original'), old, old);
  await writeAsset('unowned-control', new Uint8Array([1]), directory);
  await utimes(join(directory, 'assets', 'unowned-control'), old, old);
  await commitWorkspace(emptyWorkspace(), first.revision, directory);
  assert.ok((await readdir(join(directory, 'assets'))).includes('binary-original'), 'last-good keeps original');
  assert.equal((await readdir(join(directory, 'assets'))).includes('unowned-control'), false, 'GC removes an old unowned control');
  await writeFile(join(directory, 'workspace.recovery-corrupt.json'), 'unreadable original manifest');
  const second = (await loadWorkspace(directory)).workspace!;
  await commitWorkspace(emptyWorkspace(), second.revision, directory);
  assert.ok((await readdir(join(directory, 'assets'))).includes('binary-original'), 'unreadable recovery suspends collection');
  const before = await readFile(join(directory, 'workspace.json'));
  const invalid = fixture(); invalid.assets['binary-original'].size = 6;
  await assert.rejects(commitWorkspace(invalid, second.revision + 1, directory), /missing or incomplete/);
  assert.deepEqual(await readFile(join(directory, 'workspace.json')), before);
  assert.deepEqual(new Uint8Array(await readFile(join(directory, 'assets', 'binary-original'))), new Uint8Array([0, 255, 128, 13, 10]));
  await rm(join(directory, 'workspace.recovery-corrupt.json'));
  await commitWorkspace(emptyWorkspace(), second.revision + 1, directory);
  assert.equal((await readdir(join(directory, 'assets'))).includes('binary-original'), false, 'GC resumes when unreadable recovery is removed');
});
