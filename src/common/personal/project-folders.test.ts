import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planProjectFolder, PROJECT_FILE_BYTES, PROJECT_FOLDER_BYTES } from './project-folder-selection';
import { withProjectAssetOperation } from './project-asset-operation';
import { projectAssetKeepIds, type ProjectFile } from './project-context';
import { emptyWorkspace, validateWorkspace } from './workspace-schema';
import { assembleRequest } from './assemble-request';
import { pauseDiskWrites } from './disk-storage';
import { useProjectFilesStore, addProjectFolder } from './store-project-files';
import { useFolderStore } from '~/common/stores/folders/store-chat-folders';
import { useModelsStore } from '~/common/stores/llms/store-llms';
import { createDMessageTextContent } from '~/common/stores/chat/chat.message';

const selected = (path: string, size = 10) => ({ name: path.split('/').at(-1)!, webkitRelativePath: path, size });
const snapshot = { id: 'snapshot', name: 'Repo', selectedAt: 123, excludedCount: 4 };
const project = { id: 'project', title: 'Project', conversationIds: ['chat'], instructions: '', fileIds: ['a', 'b'], revision: 1 };
const file = (id: string, path: string): ProjectFile => ({ id, assetId: id, version: 'v1', name: 'same.txt', relativePath: path, folderSnapshot: snapshot, mime: 'text/plain', size: 10, status: 'ready', warnings: [], fragments: [], tokenEstimates: {} });

test('folder selection excludes hidden/private/build paths before counting and retains subfolder identity', () => {
  const plan = planProjectFolder(['Repo/b/same.txt', 'Repo/a/same.txt', 'Repo/.git/config', 'Repo/.env', 'Repo/node_modules/pkg/main.js', 'Repo/build/output.js', 'Repo/private.pem', 'Repo/secrets.json', 'Repo/id_rsa'].map(path => selected(path)), 18);
  assert.equal(plan.excludedCount, 7); assert.deepEqual(plan.files.map(file => file.webkitRelativePath), ['Repo/a/same.txt', 'Repo/b/same.txt']);
});

test('folder preflight rejects all over-limit or invalid selections with no partial import', async () => {
  assert.throws(() => planProjectFolder([selected('Repo/a')], 20), /Nothing added/);
  assert.throws(() => planProjectFolder([selected('Repo/a', PROJECT_FILE_BYTES + 1)], 0), /Nothing added/);
  assert.throws(() => planProjectFolder([selected('Repo/a', PROJECT_FOLDER_BYTES / 2), selected('Repo/b', PROJECT_FOLDER_BYTES / 2), selected('Repo/c', 1)], 0), /Nothing added/);
  for (const paths of [[], ['same.txt'], ['Repo/../a'], ['Repo/a', 'Other/b'], ['Repo/a', 'Repo/a'], ['Repo/.env']]) assert.throws(() => planProjectFolder(paths.map(path => selected(path)), 0));
  pauseDiskWrites(true); useFolderStore.setState({ folders: [{ ...project, fileIds: [] }] }); useProjectFilesStore.setState({ files: {} });
  // A fake oversized input proves rejection happens before arrayBuffer or any asset write.
  await assert.rejects(addProjectFolder('project', [selected('Repo/a', PROJECT_FILE_BYTES + 1)] as File[], () => {}), /Nothing added/);
  assert.deepEqual(useProjectFilesStore.getState().files, {}); assert.deepEqual(useFolderStore.getState().folders[0].fileIds, []);
});

test('legacy snapshots remain in disk and historical ownership but are not automatically sent in new requests', async () => {
  pauseDiskWrites(true); const files = { a: file('a', 'Repo/a/same.txt'), b: file('b', 'Repo/b/same.txt') };
  useFolderStore.setState({ folders: [project] }); useProjectFilesStore.setState({ files });
  useModelsStore.setState({ llms: [{ id: 'claude-opus-5-5', label: 'Opus', created: 0, description: '', hidden: false, contextTokens: 100000, maxOutputTokens: 8192, interfaces: [], parameterSpecs: [], initialParameters: {}, sId: 'test', vId: 'anthropic' }] });
  const assembled = await assembleRequest('chat', 'claude-opus-5-5', [createDMessageTextContent('user', 'task')]);
  assert.doesNotMatch(JSON.stringify(assembled.messages), /Repo\/a\/same.txt/); assert.doesNotMatch(JSON.stringify(assembled.messages), /Repo\/b\/same.txt/);
  const workspace = emptyWorkspace(); workspace.stores['app-project-files'] = { version: 1, state: { files } };
  const saved = validateWorkspace(JSON.parse(JSON.stringify(workspace))).stores['app-project-files']!.state.files as Record<string, ProjectFile>;
  assert.deepEqual(saved.a.folderSnapshot, snapshot); assert.equal(saved.b.relativePath, 'Repo/b/same.txt');
  assert.deepEqual(projectAssetKeepIds([], files, [{ id: 'a', version: 'v1' }, { id: 'b', version: 'v1' }]), ['a', 'b']); assert.deepEqual(projectAssetKeepIds([], files, []), []);
});

test('collection waits until converted assets have published ownership, and failed operations release the queue', async () => {
  const assets = new Set<string>(); let converted: string[] = []; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const importing = withProjectAssetOperation(async () => { assets.add('converted'); await gate; converted = ['converted']; });
  let collected = false;
  const collecting = withProjectAssetOperation(async () => { collected = true; for (const id of assets) if (!converted.includes(id)) assets.delete(id); });
  await Promise.resolve(); assert.equal(collected, false); release(); await Promise.all([importing, collecting]); assert.deepEqual([...assets], ['converted']);
  await assert.rejects(withProjectAssetOperation(async () => { throw new Error('disk failed'); }), /disk failed/);
  assert.equal(await withProjectAssetOperation(async () => 'next'), 'next');
});
