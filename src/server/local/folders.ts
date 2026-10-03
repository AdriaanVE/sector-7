import { constants } from 'node:fs';
import { open, realpath, readdir, mkdir, lstat, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { connectedFolderSchema, folderToolInput, ConnectedFolder } from '~/common/personal/folder-tools';
import type { Workspace } from '~/common/personal/workspace-schema';
import { loadWorkspace, dataDirectory, WorkspaceError } from './workspace';
const FILE_BYTES = 256 * 1024;
const READ_CHARS = 16000;
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function changePreview(removed: string, added: string) {
  const limit = 4000;
  return { removed: removed.slice(0, limit), added: added.slice(0, limit), removed_characters: removed.length, added_characters: added.length, truncated: removed.length > limit || added.length > limit };
}
function inside(root: string, target: string) { const rel = relative(root, target); return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`); }
export function excludedFolderPath(path: string) { return path.split('/').some(part => part === '.git' || part === 'node_modules' || part === '.env' || part.startsWith('.env.')) || /(?:^|\/)(?:credentials|secrets?|id_rsa|id_ed25519)(?:\..*)?$|\.(?:pem|key|p12|pfx|keystore)$/i.test(path); }
function eligible(path: string) {
  if (isAbsolute(path) || path.includes('\\') || path.includes('\0') || path.split('/').some(part => part === '..') || excludedFolderPath(path)) throw new WorkspaceError('Path is outside the connected folder or contains private credentials or Git internals.', 403);
}
export async function validateFolderPath(path: string): Promise<ConnectedFolder> {
  if (!isAbsolute(path)) throw new WorkspaceError('Enter the absolute folder path on this Mac.', 400);
  const root = await realpath(path);
  if (!(await lstat(root)).isDirectory() || root === sep) throw new WorkspaceError('Choose a directory other than the filesystem root.', 400);
  return connectedFolderSchema.parse({ id: crypto.randomUUID(), name: basename(root), path: root });
}
export async function authorizeFolder(projectId: string, conversationId: string, folderId: string, directory = dataDirectory()) {
  const { workspace } = await loadWorkspace(directory);
  return folderFromWorkspace(workspace, projectId, conversationId, folderId);
}
function folderFromWorkspace(workspace: Workspace | null, projectId: string, conversationId: string, folderId: string) {
  const projects = workspace?.stores['app-folders']?.state.folders;
  const chats = workspace?.stores['app-chats']?.state.conversations;
  if (!Array.isArray(projects) || !Array.isArray(chats) || !chats.some(chat => chat && typeof chat === 'object' && 'id' in chat && chat.id === conversationId)) throw new WorkspaceError('Save this chat and project before accessing its folder.', 403);
  const project = projects.find(project => project && typeof project === 'object' && 'id' in project && project.id === projectId);
  if (!project || typeof project !== 'object' || !('conversationIds' in project) || !Array.isArray(project.conversationIds) || !project.conversationIds.includes(conversationId) || !('connectedFolders' in project) || !Array.isArray(project.connectedFolders)) throw new WorkspaceError('This chat does not belong to the connected project.', 403);
  const folder = project.connectedFolders.map((value: unknown) => connectedFolderSchema.parse(value)).find((folder: ConnectedFolder) => folder.id === folderId);
  if (!folder) throw new WorkspaceError('Folder is no longer connected to this project.', 403);
  return folder;
}
export async function checkedFolderPath(folder: ConnectedFolder, path: string) {
  eligible(path);
  if (await realpath(folder.path) !== folder.path) throw new WorkspaceError('Connected folder moved or changed. Reconnect it.', 409);
  let current = folder.path;
  for (const part of path.split('/').filter(Boolean)) { current = join(current, part); if ((await lstat(current)).isSymbolicLink()) throw new WorkspaceError('Symbolic links are unavailable.', 403); }
  const resolved = await realpath(current);
  if (!inside(folder.path, resolved)) throw new WorkspaceError('Path escapes the connected folder.', 403);
  return resolved;
}
export async function textHandle(folder: ConnectedFolder, path: string, write = false) {
  const target = await checkedFolderPath(folder, path);
  if (!(await lstat(target)).isFile()) throw new WorkspaceError('Only regular files are supported.', 400);
  const handle = await open(target, (write ? constants.O_RDWR : constants.O_RDONLY) | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.nlink !== 1 || info.size > FILE_BYTES) throw new WorkspaceError('Only regular text files up to 256 KB without hard links are supported.', 400);
    const current = await lstat(await checkedFolderPath(folder, path));
    if (current.dev !== info.dev || current.ino !== info.ino) throw new WorkspaceError('File changed while opening. Read it again.', 409);
    const bytes = Buffer.alloc(FILE_BYTES + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > FILE_BYTES) throw new WorkspaceError('File exceeds 256 KB.', 400);
    const data = bytes.subarray(0, bytesRead);
    if (data.includes(0)) throw new WorkspaceError('Binary files are unavailable.', 400);
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data); } catch { throw new WorkspaceError('File is not UTF-8 text.', 400); }
    return { handle, info, data, text, target };
  } catch (error) { await handle.close(); throw error; }
}

async function unlinkUnchanged(folder: ConnectedFolder, path: string, expected: { dev: number; ino: number; size: number; mtimeMs: number }) {
  const target = await checkedFolderPath(folder, path);
  const current = await lstat(target);
  if (current.dev !== expected.dev || current.ino !== expected.ino || current.size !== expected.size || current.mtimeMs !== expected.mtimeMs || current.nlink !== 1) throw new WorkspaceError('File changed before removal. The source was kept; inspect any created destination and retry.', 409);
  // Node has no portable unlinkat: recheck immediately before removal, without claiming cross-process isolation.
  await unlink(target);
}

let edits: Promise<unknown> = Promise.resolve();
export async function executeFolderTool(folder: ConnectedFolder, value: unknown, signal?: AbortSignal, directory = dataDirectory()): Promise<Record<string, unknown>> {
  const input = folderToolInput.parse(value);
  if (input.folder_id !== folder.id) throw new WorkspaceError('Folder capability does not match.', 403);
  signal?.throwIfAborted();
  const deadline = Date.now() + 10000;
  const check = () => { signal?.throwIfAborted(); if (Date.now() > deadline) throw new WorkspaceError('Folder operation timed out. Narrow the path.', 408); };
  if (input.name === 'folder_list') {
    const entries = await readdir(await checkedFolderPath(folder, input.path), { withFileTypes: true }); check();
    const allowed = entries.filter(entry => !excludedFolderPath(entry.name) && !entry.isSymbolicLink() && (entry.isFile() || entry.isDirectory()));
    return { path: input.path, entries: allowed.slice(0, 200).map(entry => ({ name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' })), truncated: allowed.length > 200 };
  }
  if (input.name === 'folder_search') {
    const queue = [input.path]; const matches: { path: string; line: number; text: string }[] = []; let scanned = 0; let skipped = 0; let visited = 0;
    while (queue.length && scanned < 100 && matches.length < 40 && visited < 300) {
      check(); const path = queue.shift()!; visited++;
      const target = await checkedFolderPath(folder, path);
      if ((await lstat(target)).isDirectory()) {
        for (const entry of (await readdir(target, { withFileTypes: true })).slice(0, 300)) if (!excludedFolderPath(entry.name) && !entry.isSymbolicLink() && (entry.isDirectory() || entry.isFile())) queue.push([path, entry.name].filter(Boolean).join('/'));
      } else {
        scanned++; let file;
        try { file = await textHandle(folder, path); } catch { skipped++; continue; }
        try { for (const [index, line] of file.text.split('\n').entries()) if (line.includes(input.query)) { matches.push({ path, line: index + 1, text: line.slice(0, 400) }); if (matches.length >= 40) break; } } finally { await file.handle.close(); }
      }
    }
    return { matches, scanned, skipped, truncated: queue.length > 0 || matches.length >= 40 };
  }
  if (input.name === 'folder_read') {
    const file = await textHandle(folder, input.path);
    try { check(); return { path: input.path, sha256: digest(file.data), offset: input.offset, text: file.text.slice(input.offset, input.offset + READ_CHARS), next_offset: input.offset + READ_CHARS < file.text.length ? input.offset + READ_CHARS : null, total_characters: file.text.length }; } finally { await file.handle.close(); }
  }
  const run = async () => {
    check();
    if (input.name === 'folder_write' && !input.sha256) {
      eligible(input.path);
      if (!input.path || Buffer.byteLength(input.text) > FILE_BYTES) throw new WorkspaceError('Choose a file path and at most 256 KB of text.', 400);
      const parent = await checkedFolderPath(folder, dirname(input.path) === '.' ? '' : dirname(input.path));
      const destination = join(parent, basename(input.path));
      const handle = await open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { await handle.writeFile(input.text); await handle.sync(); } finally { await handle.close(); }
      return { path: input.path, sha256: digest(Buffer.from(input.text)), created: true, diff: changePreview('', input.text) };
    }
    const file = await textHandle(folder, input.path, input.name !== 'folder_move' && input.name !== 'folder_delete');
    try {
      if (digest(file.data) !== input.sha256) throw new WorkspaceError('File changed since it was read. Read it again before editing.', 409);
      let next = file.text;
      if (input.name === 'folder_edit') {
        const index = file.text.indexOf(input.old_text);
        if (index < 0 || file.text.indexOf(input.old_text, index + 1) >= 0) throw new WorkspaceError('old_text must match exactly once. Read the file and narrow the replacement.', 409);
        next = file.text.slice(0, index) + input.new_text + file.text.slice(index + input.old_text.length);
      } else if (input.name === 'folder_write') next = input.text;
      const bytes = Buffer.from(next);
      if (bytes.length > FILE_BYTES) throw new WorkspaceError('Edited file would exceed 256 KB.', 400);
      const backupId = crypto.randomUUID(); const backups = join(directory, 'file-edit-backups'); await mkdir(backups, { recursive: true });
      const backup = await open(join(backups, `${backupId}.json`), 'wx', 0o600);
      try { await backup.writeFile(JSON.stringify({ path: file.target, created: new Date().toISOString(), sha256: input.sha256, mode: file.info.mode, originalBase64: file.data.toString('base64') })); await backup.sync(); } finally { await backup.close(); }
      check(); const current = await lstat(await checkedFolderPath(folder, input.path));
      if (current.dev !== file.info.dev || current.ino !== file.info.ino || current.nlink !== 1) throw new WorkspaceError('File changed before editing. Read it again.', 409);
      const latest = Buffer.alloc(FILE_BYTES + 1); const read = await file.handle.read(latest, 0, latest.length, 0);
      if (digest(latest.subarray(0, read.bytesRead)) !== input.sha256) throw new WorkspaceError('File changed before editing. Read it again.', 409);
      if (input.name === 'folder_move') {
        eligible(input.destination);
        const parent = await checkedFolderPath(folder, dirname(input.destination) === '.' ? '' : dirname(input.destination));
        const destination = await open(join(parent, basename(input.destination)), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, file.info.mode & 0o777);
        try { await destination.writeFile(file.data); await destination.sync(); } finally { await destination.close(); }
        await unlinkUnchanged(folder, input.path, file.info);
        return { path: input.path, destination: input.destination, backup_id: backupId, moved: true };
      }
      if (input.name === 'folder_delete') {
        await unlinkUnchanged(folder, input.path, file.info);
        return { path: input.path, backup_id: backupId, deleted: true, recovery: 'Original saved in local app data file-edit-backups.' };
      }
      // The pinned handle prevents a later path swap from redirecting this write.
      let written = 0;
      while (written < bytes.length) { const result = await file.handle.write(bytes, written, bytes.length - written, written); if (!result.bytesWritten) throw new Error('File write failed. Restore the recovery copy.'); written += result.bytesWritten; }
      await file.handle.truncate(bytes.length); await file.handle.sync();
      return { path: input.path, sha256: digest(bytes), backup_id: backupId, diff: changePreview(input.name === 'folder_edit' ? input.old_text : file.text, input.name === 'folder_edit' ? input.new_text : next), recovery: 'Original saved in the local app data file-edit-backups directory.' };
    } finally { await file.handle.close(); }
  };
  const result = edits.then(run, run); edits = result.catch(() => undefined); return result;
}

/** A saved invocation, current project membership and registered root form the local capability. */
export async function authorizeFolderInvocation(projectId: string, conversationId: string, folderId: string, invocationId: string, expectedName: string, directory = dataDirectory()) {
  const { workspace } = await loadWorkspace(directory);
  const folder = folderFromWorkspace(workspace, projectId, conversationId, folderId);
  const chats = workspace?.stores['app-chats']?.state.conversations;
  if (!Array.isArray(chats)) throw new WorkspaceError('Chat is unavailable.', 403);
  const chat = chats.find(chat => chat && typeof chat === 'object' && 'id' in chat && chat.id === conversationId);
  if (!chat || typeof chat !== 'object' || !('messages' in chat) || !Array.isArray(chat.messages)) throw new WorkspaceError('Chat is unavailable.', 403);
  for (const message of chat.messages) {
    if (!message || typeof message !== 'object' || !('fragments' in message) || !Array.isArray(message.fragments) || ('pendingIncomplete' in message && message.pendingIncomplete)) continue;
    for (const fragment of message.fragments) {
      if (!fragment || typeof fragment !== 'object' || !('part' in fragment) || !fragment.part || typeof fragment.part !== 'object') continue;
      const part = fragment.part;
      if ('pt' in part && part.pt === 'tool_invocation' && 'id' in part && part.id === invocationId && 'invocation' in part && part.invocation && typeof part.invocation === 'object' && 'name' in part.invocation && part.invocation.name === expectedName && 'args' in part.invocation && typeof part.invocation.args === 'string') {
        const args = JSON.parse(part.invocation.args);
        if (args.folder_id === folderId) return { folder, args, responded: message.fragments.some((fragment: unknown) => fragment && typeof fragment === 'object' && 'part' in fragment && fragment.part && typeof fragment.part === 'object' && 'pt' in fragment.part && fragment.part.pt === 'tool_response' && 'id' in fragment.part && fragment.part.id === invocationId) };
      }
    }
  }
  throw new WorkspaceError('Local tool invocation was not saved in this chat.', 403);
}
