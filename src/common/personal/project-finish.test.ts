import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useModelsStore } from '~/common/stores/llms/store-llms';
import { useChatStore } from '~/common/stores/chat/store-chats';
import { createDConversation, duplicateDConversation } from '~/common/stores/chat/chat.conversation';
import { createDMessageTextContent, MESSAGE_FLAG_VND_ANT_CACHE_USER } from '~/common/stores/chat/chat.message';
import { useFolderStore } from '~/common/stores/folders/store-chat-folders';
import { useProjectFilesStore } from './store-project-files';
import { assembleRequest } from './assemble-request';
import { emptyWorkspace, normalizeWorkspace, validateWorkspace } from './workspace-schema';
import { projectAssetKeepIds, type ProjectFile } from './project-context';
import { pauseDiskWrites } from './disk-storage';

const file: ProjectFile = { id: 'original', assetId: 'original', version: 'first', name: 'source.txt', mime: 'text/plain', size: 10, status: 'ready', warnings: [], fragments: [], tokenEstimates: {} };
const project = { id: 'project', title: 'Project', conversationIds: ['chat'], instructions: 'PROJECT INSTRUCTIONS', fileIds: ['original'], revision: 2 };

test('project ownership moves deterministically, re-adding same membership never unfiles, notice dismisses', () => {
  pauseDiskWrites(true); useFolderStore.setState({ folders: [project, { ...project, id: 'two', conversationIds: [] }], migrationSummary: 'Migrated' });
  useFolderStore.getState().addConversationToFolder('project', 'chat'); assert.deepEqual(useFolderStore.getState().folders[0].conversationIds, ['chat']);
  useFolderStore.getState().addConversationToFolder('two', 'chat'); assert.deepEqual(useFolderStore.getState().folders.map(p => p.conversationIds), [[], ['chat']]);
  useFolderStore.getState().dismissMigrationSummary(); assert.equal(useFolderStore.getState().migrationSummary, undefined);
  useFolderStore.getState().deleteFolder('two'); assert.equal(useFolderStore.getState().folders.length, 1);
});

test('actual request assembly includes instructions, skills, project provenance and selected model budget', () => {
  pauseDiskWrites(true); const chat = createDConversation(); chat.id = 'chat';
  useChatStore.setState({ conversations: [chat] }); useFolderStore.setState({ folders: [project] }); useProjectFilesStore.setState({ files: { original: file } });
  useModelsStore.setState({ llms: [{ id: 'claude-opus-5-5', label: 'Opus', created: 0, description: '', hidden: false, contextTokens: 100000, maxOutputTokens: 8192, interfaces: [], parameterSpecs: [], initialParameters: {}, sId: 'test', vId: 'anthropic' }] });
  const prompt = createDMessageTextContent('user', 'TASK'); prompt.userFlags = [MESSAGE_FLAG_VND_ANT_CACHE_USER];
  prompt.metadata = { selectedSkills: [{ id: 'skill', origin: 'claude', name: 'Test', revision: 'v1', instructions: 'SKILL INSTRUCTIONS', resources: [] }] };
  const built = assembleRequest(chat.id, chat.chatConfig.llmId, [prompt]);
  assert.ok(JSON.stringify(built.system).includes('PROJECT INSTRUCTIONS')); assert.ok(JSON.stringify(built.messages).includes('SKILL INSTRUCTIONS'));
  assert.deepEqual(built.context?.files, []); assert.equal(built.budget.limit, 100000);
  assert.equal(built.budget.total - built.inputTokens, 1024 + 8192 + 16384 + 10000);
  useModelsStore.getState().updateLLM('claude-opus-5-5', { contextTokens: 1000 });
  assert.equal(assembleRequest(chat.id, chat.chatConfig.llmId, [prompt], { allowOverBudget: true }).budget.fits, false);
  assert.throws(() => assembleRequest(chat.id, chat.chatConfig.llmId, [prompt]), /Start a shorter chat/);
  useProjectFilesStore.setState({ files: { original: { ...file, status: 'failed', warnings: ['Scanned PDF requires OCR'] } } });
  assert.doesNotThrow(() => assembleRequest(chat.id, chat.chatConfig.llmId, [prompt], { allowOverBudget: true }));
});

test('removed originals retain historical version ownership across duplicate and disk serialization', () => {
  const chat = createDConversation(); const reply = createDMessageTextContent('assistant', 'Old reply');
  reply.generator = { mgt: 'named', name: 'Claude', projectContext: { projectId: 'project', instructionRevision: 2, files: [{ id: file.id, version: file.version }] } }; chat.messages = [reply];
  const copy = duplicateDConversation(chat, undefined, false); assert.deepEqual(copy.messages[0].generator?.projectContext, reply.generator.projectContext);
  const workspace = emptyWorkspace(); const { _abortController, ...durable } = chat;
  workspace.stores['app-chats'] = { version: 5, state: { conversations: [durable] } };
  workspace.stores['app-project-files'] = { version: 1, state: { files: { original: file } } };
  workspace.assets.original = { size: 10, mime: 'text/plain', metadata: {} };
  const serialized = validateWorkspace(JSON.parse(JSON.stringify(workspace))); assert.equal(serialized.stores['app-project-files']?.state.files !== undefined, true);
  assert.deepEqual(projectAssetKeepIds([], { original: file }, reply.generator.projectContext!.files), ['original']);
  assert.deepEqual(projectAssetKeepIds([], { original: { ...file, version: 'new' } }, reply.generator.projectContext!.files), []);
  assert.deepEqual(projectAssetKeepIds([], { original: file }, []), []);
});

test('reload retains named extraction failure instead of an endless processing state', () => {
  const workspace = emptyWorkspace(); workspace.stores['app-project-files'] = { version: 1, state: { files: { original: { ...file, status: 'processing' } } } };
  const normalized = normalizeWorkspace(workspace); const files = normalized.stores['app-project-files']!.state.files as Record<string, ProjectFile>;
  assert.equal(files.original.status, 'failed'); assert.equal(files.original.name, 'source.txt'); assert.match(files.original.warnings[0], /interrupted/);
});
