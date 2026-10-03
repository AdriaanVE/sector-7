import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { create } from 'zustand';
import { Workspace, emptyWorkspace, reviveAssetDates, STORE_NAMES, workspaceAssetIds, validateWorkspace } from './workspace-schema';

export const useDiskStatus = create<{ ready: boolean; error: string | null; lastSaved: number | null; directory: string }>(() => ({ ready: false, error: null, lastSaved: null, directory: '' }));
let workspace = emptyWorkspace();
let initialized = false;
let paused = false;
let dirty = false;
let deadline = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let writing: Promise<void> | undefined;
let failure: Error | undefined;
const pendingAssets = new Map<string, LocalAsset>();

export async function localJSON(path: string, init?: RequestInit) {
  const response = await fetch(`/api/local/${path}`, { ...init, headers: { 'Content-Type': 'application/json', 'X-AI-GUI': '1', ...init?.headers } });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Local storage request failed.');
  return value;
}
export function currentWorkspace() { return structuredClone(workspace); }
export function diskReady() { return initialized; }
export function installWorkspace(next: Workspace, directory?: string) {
  workspace = reviveAssetDates(structuredClone(next)); initialized = true; failure = undefined; dirty = false; deadline = 0;
  if (timer) clearTimeout(timer);
  useDiskStatus.setState({ ready: true, error: null, ...(directory ? { directory } : {}) });
}
export function pauseDiskWrites(value: boolean) { paused = value; if (!value && dirty) void flushDisk().catch(() => undefined); }

export function diskStorage<S>(): PersistStorage<S> {
  return {
    getItem: async name => {
      if (!initialized) throw new Error('Disk must load before store hydration.');
      const stored = workspace.stores[name as typeof STORE_NAMES[number]];
      return stored ? structuredClone(stored) as StorageValue<S> : null;
    },
    setItem: (name, value) => {
      if (!initialized) return;
      workspace = { ...workspace, stores: { ...workspace.stores, [name]: structuredClone(value) } };
      dirty = true;
      if (paused) return;
      if (!deadline) deadline = Date.now() + 1234;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void flushDisk().catch(() => undefined); }, Math.max(0, Math.min(321, deadline - Date.now())));
    },
    removeItem: () => { throw new Error('Durable stores cannot be cleared. Use validated restore.'); },
  };
}

export async function flushDisk(drain = true): Promise<void> {
  if (!initialized) throw new Error('Disk must load before saving.');
  if (paused) throw new Error('Workspace writes are paused. Retry after backup or restore.');
  if (timer) clearTimeout(timer);
  if (writing) { await writing; if (dirty) return flushDisk(drain); return; }
  if (!dirty) { if (failure) throw failure; return; }
  dirty = false; deadline = 0;
  const snapshot = structuredClone(workspace);
  writing = (async () => {
    try {
      await prepareAssets(snapshot);
      validateWorkspace(snapshot);
      const result = await localJSON('workspace', { method: 'PUT', body: JSON.stringify({ workspace: snapshot, expectedRevision: snapshot.revision, expectedEpoch: snapshot.revisionEpoch }) });
      workspace = { ...workspace, assets: snapshot.assets, revision: result.workspace.revision, revisionEpoch: result.workspace.revisionEpoch, migrated: true };
      for (const id of Object.keys(snapshot.assets)) pendingAssets.delete(id);
      failure = undefined;
      useDiskStatus.setState({ error: null, lastSaved: Date.now() });
    } catch (error) {
      dirty = true;
      failure = error instanceof Error ? error : new Error('Disk save failed.');
      useDiskStatus.setState({ error: failure.message });
      throw failure;
    } finally { writing = undefined; }
  })();
  await writing;
  if (dirty && drain) return flushDisk();
}

type LocalAsset = { id: string; data: { base64: string; mimeType: string }; cache: unknown };
function assetManifest(asset: LocalAsset) {
  const { data, cache, ...metadata } = asset;
  return { size: atob(data.base64).length, mime: data.mimeType, metadata };
}

/** Keep bytes disposable until a durable chat or project references them. */
export async function persistAsset<T extends LocalAsset>(asset: T) {
  if (!initialized) throw new Error('Local assets are still loading.');
  pendingAssets.set(asset.id, structuredClone(asset));
  dirty = true;
}

async function prepareAssets(snapshot: Workspace) {
  for (const asset of pendingAssets.values()) snapshot.assets[asset.id] = assetManifest(asset);
  const owned = workspaceAssetIds(snapshot);
  const assets: Workspace['assets'] = {};
  for (const id of owned) {
    let manifest = workspace.assets[id];
    if (!manifest) {
      const asset = pendingAssets.get(id) ?? await (await import('~/modules/dblobs/dblobs.db')).getDBAsset(id);
      if (!asset) throw new Error(`Referenced asset ${id} is missing from the browser cache. Originals were preserved.`);
      const bytes = Uint8Array.from(atob(asset.data.base64), char => char.charCodeAt(0));
      const response = await fetch(`/api/local/assets/${id}`, { method: 'PUT', headers: { 'X-AI-GUI': '1' }, body: bytes });
      if (!response.ok) throw new Error((await response.json()).error || 'Asset save failed.');
      manifest = assetManifest(asset);
    }
    assets[id] = manifest;
  }
  snapshot.assets = assets;
}

export async function loadDiskAsset(id: string) {
  const manifest = workspace.assets[id];
  if (!manifest) return undefined;
  const response = await fetch(`/api/local/assets/${id}`);
  if (!response.ok) throw new Error(`Asset ${id} could not be loaded from disk.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return reviveAssetDates({ ...manifest.metadata, id, data: { mimeType: manifest.mime, base64: btoa(binary) }, cache: {} });
}

export async function downloadWorkspaceBackup() {
  await flushDisk(); pauseDiskWrites(true);
  try {
    const response = await fetch('/api/local/backup');
    if (!response.ok) throw new Error((await response.json()).error || 'Backup failed.');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a'); link.href = url; link.download = 'ai-gui-backup.zip'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally { pauseDiskWrites(false); }
}
