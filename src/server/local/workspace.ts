import { open, mkdir, readFile, rename, stat, copyFile, readdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { zipSync, strToU8, strFromU8 } from 'fflate';
import { Readable } from 'node:stream';
import { WORKSPACE_BYTE_LIMIT, backupSizeError, decodeBackup, storedBackupSize } from './workspace-archive';
import { emptyWorkspace, safeId, validateWorkspace, workspaceAssetIds, Workspace } from '~/common/personal/workspace-schema';
import { withWorkspaceLock, WorkspaceLockBusyError } from './workspace-lock';

export class WorkspaceError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

export function dataDirectory() { return process.env.AI_GUI_DATA_DIR || join(homedir(), 'Library', 'Application Support', 'AI GUI'); }

async function atomicWrite(path: string, bytes: Uint8Array | string) {
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  const file = await open(temporary, 'wx', 0o600);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  await rename(temporary, path);
}

async function readWorkspaceFile(path: string): Promise<Workspace | null> {
  try { return validateWorkspace(JSON.parse(await readFile(path, 'utf8'))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw new WorkspaceError('Workspace is corrupt. Recover the last good save or restore a backup.', 422); }
}

/** Each operation locks the actual data directory across route bundles and Node processes. */
async function exclusive<T>(directory: string, run: () => Promise<T>): Promise<T> {
  try { return await withWorkspaceLock(directory, run); }
  catch (error) {
    if (error instanceof WorkspaceLockBusyError) throw new WorkspaceError(error.message, 503);
    throw error;
  }
}

export async function loadWorkspace(directory = dataDirectory()) {
  return exclusive(directory, async () => {
    const workspace = await readWorkspaceFile(join(directory, 'workspace.json'));
    if (workspace) await verifyAssets(workspace, directory);
    return { workspace, directory };
  });
}

export async function workspaceRecoveryRevision(directory = dataDirectory()) {
  return exclusive(directory, async () => {
    try { const current = await readWorkspaceFile(join(directory, 'workspace.json')); return { revision: current?.revision ?? 0, revisionEpoch: current?.revisionEpoch }; }
    catch (error) { if (error instanceof WorkspaceError && error.status === 422) return { revision: 'corrupt' }; throw error; }
  });
}

async function verifyAssets(workspace: Workspace, directory: string) {
  for (const [id, asset] of Object.entries(workspace.assets)) {
    safeId.parse(id);
    try { if ((await stat(join(directory, 'assets', id))).size !== asset.size) throw new Error(); }
    catch { throw new WorkspaceError(`Asset ${id} is missing or incomplete. Restore a backup.`, 422); }
  }
}

export async function commitWorkspace(value: unknown, expectedRevision: number, directory = dataDirectory(), expectedEpoch?: string): Promise<Workspace> {
  return exclusive(directory, async () => {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new WorkspaceError('Expected workspace revision is invalid.', 400);
    const current = await readWorkspaceFile(join(directory, 'workspace.json'));
    if ((current?.revision ?? 0) !== expectedRevision || current?.revisionEpoch !== expectedEpoch) throw new WorkspaceError('Another browser saved newer data. Reload this workspace before editing.');
    const incoming = validateWorkspace(value);
    const owned = workspaceAssetIds(incoming);
    incoming.assets = Object.fromEntries(Object.entries(incoming.assets).filter(([id]) => owned.has(id)));
    await mkdir(join(directory, 'assets'), { recursive: true });
    await verifyAssets(incoming, directory);
    const next = { ...incoming, revision: expectedRevision + 1, revisionEpoch: current?.revisionEpoch, migrated: true };
    if (current) await atomicWrite(join(directory, 'workspace.last-good.json'), JSON.stringify(current));
    await atomicWrite(join(directory, 'workspace.json'), JSON.stringify(next));
    const dir = await open(directory, 'r'); try { await dir.sync(); } finally { await dir.close(); }
    await collectUnownedAssets(next, current, directory).catch(error => console.warn('Workspace saved; deferred asset collection failed.', error));
    return next;
  });
}

export async function writeAsset(id: string, bytes: Uint8Array, directory = dataDirectory()) {
  return exclusive(directory, () => writeAssetUnlocked(id, bytes, directory));
}

/** Caller owns the directory lock, or writes into private restore staging. */
async function writeAssetUnlocked(id: string, bytes: Uint8Array, directory: string) {
  safeId.parse(id);
  if (bytes.length > WORKSPACE_BYTE_LIMIT) throw new WorkspaceError('Asset exceeds the 250 MB limit.', 413);
  await mkdir(join(directory, 'assets'), { recursive: true });
  const path = join(directory, 'assets', id);
  try {
    if ((await stat(path)).size !== bytes.length) throw new WorkspaceError('Asset IDs are immutable. Upload a new version with a new ID.');
    const existing = await readFile(path);
    if (!existing.equals(Buffer.from(bytes))) throw new WorkspaceError('Asset IDs are immutable. Upload a new version with a new ID.');
    return;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await atomicWrite(path, bytes);
}

export async function readAsset(id: string, directory = dataDirectory()) {
  safeId.parse(id);
  return exclusive(directory, async () => {
    const file = await open(join(directory, 'assets', id), 'r');
    try {
      const size = (await file.stat()).size;
      if (size > WORKSPACE_BYTE_LIMIT) throw new WorkspaceError('Asset exceeds the 250 MB limit.', 413);
      // The open descriptor remains valid if collection unlinks this immutable asset.
      if (!size) { await file.close(); return new ReadableStream<Uint8Array>({ start(controller) { controller.close(); } }); }
      return Readable.toWeb(file.createReadStream({ end: size - 1 }), { strategy: { highWaterMark: 64 * 1024, size: chunk => chunk.byteLength } }) as ReadableStream<Uint8Array>;
    } catch (error) { await file.close(); throw error; }
  });
}

export async function recoverWorkspace(directory = dataDirectory()) {
  return exclusive(directory, async () => {
    const good = await readWorkspaceFile(join(directory, 'workspace.last-good.json'));
    if (!good) throw new WorkspaceError('No last good save exists. Restore a backup.', 404);
    await verifyAssets(good, directory);
    await preservePrimary(directory);
    let current: Workspace | null = null;
    try { current = await readWorkspaceFile(join(directory, 'workspace.json')); } catch { /* preserved corrupt primary */ }
    const next = { ...good, revision: Math.max(current?.revision ?? 0, good.revision) + 1, revisionEpoch: crypto.randomUUID() };
    await atomicWrite(join(directory, 'workspace.json'), JSON.stringify(next));
    const dir = await open(directory, 'r'); try { await dir.sync(); } finally { await dir.close(); }
    return next;
  });
}

export async function backupWorkspace(directory = dataDirectory()) {
  return exclusive(directory, async () => {
    const workspace = await readWorkspaceFile(join(directory, 'workspace.json'));
    if (!workspace) throw new WorkspaceError('Save the workspace before creating a backup.', 404);
    const owned = workspaceAssetIds(workspace);
    workspace.assets = Object.fromEntries(Object.entries(workspace.assets).filter(([id]) => owned.has(id)));
    await verifyAssets(workspace, directory);
    const files: Record<string, Uint8Array> = { 'workspace.json': strToU8(JSON.stringify(workspace)) };
    const sizes = [{ name: 'workspace.json', size: files['workspace.json'].length }, ...Object.entries(workspace.assets).map(([id, asset]) => ({ name: `assets/${id}`, size: asset.size }))];
    const expectedSize = storedBackupSize(sizes);
    for (const id of Object.keys(workspace.assets)) files[`assets/${id}`] = await readFile(join(directory, 'assets', id));
    // Stored ZIP output has exact bounded overhead, avoiding temporary compressed copies.
    const backup = zipSync(files, { level: 0 });
    if (backup.length !== expectedSize || backup.length > WORKSPACE_BYTE_LIMIT) throw backupSizeError();
    return backup;
  });
}

/** Validated staging is complete before any active manifest is replaced. A corrupt primary is preserved. */
export async function restoreWorkspace(bytes: Uint8Array, expectedRevision: number | null, directory = dataDirectory(), expectedEpoch?: string) {
  const files = decodeBackup(bytes);
  if (!files['workspace.json']) throw new WorkspaceError('Backup is missing workspace.json.', 422);
  const workspace = validateWorkspace(JSON.parse(strFromU8(files['workspace.json'])));
  const owned = workspaceAssetIds(workspace);
  workspace.assets = Object.fromEntries(Object.entries(workspace.assets).filter(([id]) => owned.has(id)));
  const staged = join(directory, `restore-${crypto.randomUUID()}`);
  await mkdir(join(staged, 'assets'), { recursive: true });
  try {
    for (const [id, asset] of Object.entries(workspace.assets)) {
      if (!files[`assets/${id}`] || files[`assets/${id}`].length !== asset.size) throw new WorkspaceError(`Backup asset ${id} is missing or incomplete.`, 422);
      await writeAssetUnlocked(id, files[`assets/${id}`], staged);
    }
    await verifyAssets(workspace, staged);
    await atomicWrite(join(staged, 'workspace.json'), JSON.stringify(workspace));
    return await exclusive(directory, async () => {
      let current: Workspace | null = null; let corrupt = false;
      try { current = await readWorkspaceFile(join(directory, 'workspace.json')); }
      catch (error) { if (!(error instanceof WorkspaceError) || error.status !== 422) throw error; corrupt = true; }
      if (corrupt ? expectedRevision !== null : expectedRevision !== (current?.revision ?? 0) || current?.revisionEpoch !== expectedEpoch)
        throw new WorkspaceError('Workspace changed since recovery started. Retry loading before restoring.');
      // Copy the primary byte-for-byte, including invalid JSON, before replacement.
      await preservePrimary(directory);
      await mkdir(join(directory, 'assets'), { recursive: true });
      for (const id of Object.keys(workspace.assets)) await writeAssetUnlocked(id, files[`assets/${id}`], directory);
      const next = { ...workspace, revision: (current?.revision ?? 0) + 1, revisionEpoch: crypto.randomUUID(), migrated: true };
      if (current) await atomicWrite(join(directory, 'workspace.last-good.json'), JSON.stringify(current));
      await atomicWrite(join(directory, 'workspace.json'), JSON.stringify(next));
      const dir = await open(directory, 'r'); try { await dir.sync(); } finally { await dir.close(); }
      await collectUnownedAssets(next, current, directory).catch(error => console.warn('Workspace saved; deferred asset collection failed.', error));
      return next;
    });
  } finally { await rm(staged, { recursive: true, force: true }); }
}

async function preservePrimary(directory: string) {
  try { await copyFile(join(directory, 'workspace.json'), join(directory, `workspace.recovery-${crypto.randomUUID()}.json`)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}

/** Only collect after commit; retain last-good and every preserved recovery manifest's bytes. */
async function collectUnownedAssets(current: Workspace, lastGood: Workspace | null, directory: string) {
  const keep = new Set([...Object.keys(current.assets), ...Object.keys(lastGood?.assets ?? {})]);
  const entries = await readdir(directory);
  for (const name of entries.filter(name => /^workspace\.recovery-.*\.json$/.test(name))) {
    try { const historical = await readWorkspaceFile(join(directory, name)); Object.keys(historical?.assets ?? {}).forEach(id => keep.add(id)); }
    catch { return; } // An unreadable preserved primary may still own bytes. Keep them until it is repaired.
  }
  // Uploaded bytes can belong to a concurrent in-flight save. Only older unowned bytes are eligible.
  for (const id of await readdir(join(directory, 'assets'))) {
    if (!safeId.safeParse(id).success || keep.has(id)) continue;
    if ((await stat(join(directory, 'assets', id))).mtimeMs < Date.now() - 24 * 60 * 60 * 1000)
      await rm(join(directory, 'assets', id));
  }
}
