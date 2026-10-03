import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { authorizeFolder, executeFolderTool, validateFolderPath } from './folders';
import { withFolderReceipt } from './folder-receipts';
import { commitWorkspace } from './workspace';
import { emptyWorkspace } from '~/common/personal/workspace-schema';

test('connected folder tools read current files on demand and preserve recoverable edit/create/move/delete', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'folder-tools-')); const root = join(temp, 'repo'); const data = join(temp, 'app'); await mkdir(root); await mkdir(join(root, '.github'));
  try {
    await writeFile(join(root, 'a.txt'), 'alpha\nbeta\n', { mode: 0o640 }); await writeFile(join(root, '.github', 'test.yml'), 'workflow');
    const folder = await validateFolderPath(root); const run = (name: string, args = {}) => executeFolderTool(folder, { name, folder_id: folder.id, ...args }, undefined, data);
    const list = await run('folder_list'); assert.match(JSON.stringify(list), /\.github/);
    let read = await run('folder_read', { path: 'a.txt' }); assert.equal(read.text, 'alpha\nbeta\n');
    await writeFile(join(root, 'a.txt'), 'current\nbeta\n');
    await assert.rejects(run('folder_edit', { path: 'a.txt', sha256: read.sha256, old_text: 'alpha', new_text: 'changed' }), /changed since/);
    read = await run('folder_read', { path: 'a.txt' });
    const edited = await run('folder_edit', { path: 'a.txt', sha256: read.sha256, old_text: 'current', new_text: 'updated' });
    assert.equal(await readFile(join(root, 'a.txt'), 'utf8'), 'updated\nbeta\n'); assert.equal((await stat(join(root, 'a.txt'))).mode & 0o777, 0o640);
    const backup = JSON.parse(await readFile(join(data, 'file-edit-backups', `${edited.backup_id}.json`), 'utf8')); assert.equal(Buffer.from(backup.originalBase64, 'base64').toString(), 'current\nbeta\n');
    assert.match(JSON.stringify(await run('folder_search', { query: 'updated' })), /updated/);
    const created = await run('folder_write', { path: 'new.txt', text: 'created' });
    await assert.rejects(run('folder_write', { path: 'new.txt', text: 'overwrite without hash' }), /EEXIST/);
    await run('folder_move', { path: 'new.txt', destination: 'moved.txt', sha256: created.sha256 }); assert.equal(await readFile(join(root, 'moved.txt'), 'utf8'), 'created');
    await run('folder_delete', { path: 'moved.txt', sha256: created.sha256 }); await assert.rejects(readFile(join(root, 'moved.txt')), /ENOENT/);
    assert.equal((await readdir(join(data, 'file-edit-backups'))).length, 3);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
test('folder capability rejects traversal, absolute paths, symlinks, private/binary/oversize files and cancellation', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'folder-security-')); const root = join(temp, 'repo'); await mkdir(root);
  try {
    await writeFile(join(temp, 'outside'), 'private'); await symlink(join(temp, 'outside'), join(root, 'escape')); await writeFile(join(root, '.env'), 'key'); await writeFile(join(root, 'binary'), Buffer.from([0, 1])); await writeFile(join(root, 'huge'), 'x'.repeat(256 * 1024 + 1));
    const folder = await validateFolderPath(root);
    for (const path of ['../outside', join(temp, 'outside'), 'escape', '.env', 'binary', 'huge']) await assert.rejects(executeFolderTool(folder, { name: 'folder_read', folder_id: folder.id, path }));
    const stop = new AbortController(); stop.abort(); await assert.rejects(executeFolderTool(folder, { name: 'folder_list', folder_id: folder.id }, stop.signal));
    await assert.rejects(executeFolderTool(folder, { name: 'folder_list', folder_id: 'different' }), /capability/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
test('persistent project membership grants access only after save and mutation receipts execute exactly once', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'folder-membership-')); const root = join(temp, 'repo'); await mkdir(root);
  try {
    const folder = await validateFolderPath(root); const workspace = emptyWorkspace();
    workspace.stores['app-folders'] = { version: 1, state: { folders: [{ id: 'project', title: 'Project', conversationIds: ['chat'], instructions: '', fileIds: [], revision: 1, connectedFolders: [folder] }], enableFolders: true } };
    workspace.stores['app-chats'] = { version: 5, state: { conversations: [{ id: 'chat', messages: [], created: 0, updated: null, tokenCount: 0, systemPurposeId: '' }] } };
    await assert.rejects(authorizeFolder('project', 'chat', folder.id, temp), /Save/);
    await commitWorkspace(workspace, 0, temp); assert.equal((await authorizeFolder('project', 'chat', folder.id, temp)).path, folder.path);
    await assert.rejects(authorizeFolder('project', 'other', folder.id, temp)); await assert.rejects(authorizeFolder('project', 'chat', 'unknown', temp));
    let calls = 0; const run = () => withFolderReceipt('chat', 'call', { text: 'a' }, async () => { calls++; return { ok: true }; }, temp);
    await run(); await run(); assert.equal(calls, 1);
    await assert.rejects(withFolderReceipt('chat', 'call', { text: 'different' }, async () => ({}), temp), /different arguments/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('saved invocation authorization rejects incomplete calls and exposes settled status from one workspace revision', async () => {
  const { authorizeFolderInvocation } = await import('./folders');
  const { createDMessageFromFragments } = await import('~/common/stores/chat/chat.message');
  const { create_FunctionCallInvocation_ContentFragment, create_FunctionCallResponse_ContentFragment } = await import('~/common/stores/chat/chat.fragments');
  const temp = await mkdtemp(join(tmpdir(), 'folder-invocation-')); const root = join(temp, 'repo'); await mkdir(root);
  try {
    const folder = await validateFolderPath(root); const workspace = emptyWorkspace();
    const message = createDMessageFromFragments('assistant', [create_FunctionCallInvocation_ContentFragment('call', 'folder_read', JSON.stringify({ folder_id: folder.id, path: 'a.txt' }))]);
    message.pendingIncomplete = true;
    workspace.stores['app-folders'] = { version: 1, state: { folders: [{ id: 'project', title: 'Project', conversationIds: ['chat'], instructions: '', fileIds: [], revision: 1, connectedFolders: [folder] }], enableFolders: true } };
    workspace.stores['app-chats'] = { version: 5, state: { conversations: [{ id: 'chat', messages: [message], created: 0, updated: null, tokenCount: 0, systemPurposeId: '' }] } };
    let saved = await commitWorkspace(workspace, 0, temp);
    await assert.rejects(authorizeFolderInvocation('project', 'chat', folder.id, 'call', 'folder_read', temp), /not saved/);
    message.pendingIncomplete = false; saved = await commitWorkspace({ ...workspace, revision: saved.revision }, saved.revision, temp);
    assert.equal((await authorizeFolderInvocation('project', 'chat', folder.id, 'call', 'folder_read', temp)).responded, false);
    await assert.rejects(authorizeFolderInvocation('project', 'chat', folder.id, 'call', 'folder_edit', temp), /not saved/);
    message.fragments.push(create_FunctionCallResponse_ContentFragment('call', false, 'folder_read', '{"text":"a"}', 'client'));
    saved = await commitWorkspace({ ...workspace, revision: saved.revision }, saved.revision, temp);
    assert.equal((await authorizeFolderInvocation('project', 'chat', folder.id, 'call', 'folder_read', temp)).responded, true);
    workspace.stores['app-folders'].state.folders = [];
    await commitWorkspace({ ...workspace, revision: saved.revision }, saved.revision, temp);
    await assert.rejects(authorizeFolderInvocation('project', 'chat', folder.id, 'call', 'folder_read', temp), /does not belong/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('unrelated edits retain a UTF-8 source byte order mark', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'folder-bom-')); const root = join(temp, 'repo'); await mkdir(root);
  try {
    await writeFile(join(root, 'source.txt'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('alpha beta')]));
    const folder = await validateFolderPath(root);
    const read = await executeFolderTool(folder, { name: 'folder_read', folder_id: folder.id, path: 'source.txt' });
    await executeFolderTool(folder, { name: 'folder_edit', folder_id: folder.id, path: 'source.txt', sha256: read.sha256, old_text: 'beta', new_text: 'gamma' }, undefined, join(temp, 'data'));
    assert.deepEqual(await readFile(join(root, 'source.txt')), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('alpha gamma')]));
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('large writes retain full file bytes but return a bounded change preview', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'folder-preview-')); const root = join(temp, 'repo'); await mkdir(root);
  try {
    const folder = await validateFolderPath(root); const text = 'source line\n'.repeat(15000);
    const result = await executeFolderTool(folder, { name: 'folder_write', folder_id: folder.id, path: 'large.txt', text }, undefined, join(temp, 'data'));
    assert.equal(await readFile(join(root, 'large.txt'), 'utf8'), text);
    assert.ok(JSON.stringify(result).length < 5000);
    assert.equal((result.diff as { truncated: boolean }).truncated, true);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
