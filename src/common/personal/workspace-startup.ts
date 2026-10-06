import { diskStorage, flushDisk, installWorkspace, localJSON, persistAsset } from './disk-storage';
import { emptyWorkspace, normalizeWorkspace, validateWorkspace, workspaceAssetIds } from './workspace-schema';

interface HydratableStore {
  persist: { rehydrate: () => Promise<void> | void; hasHydrated: () => boolean };
}
interface LegacyWorkspaceReads {
  chats: () => Promise<unknown>;
  store: (name: string) => string | null;
  assets: () => Promise<Parameters<typeof persistAsset>[0][]>;
}

/** The provider stays in recovery until the durable workspace and all stores load. */
export async function initializeWorkspace(stores: HydratableStore[], legacyReads: LegacyWorkspaceReads) {
  const result = await localJSON('workspace');
  if (result.workspace) installWorkspace(validateWorkspace(result.workspace), result.directory);
  else {
    const legacy = emptyWorkspace();
    const chats = await legacyReads.chats();
    if (chats) {
      const value = typeof chats === 'string' ? JSON.parse(chats) : chats;
      const stored = value as { version?: number; state?: { conversations?: Record<string, unknown>[] } };
      legacy.stores['app-chats'] = { version: stored.version ?? 0, state: {
        conversations: (stored.state?.conversations || []).filter(chat => !chat._isIncognito).map(chat => {
          const { _abortController, ...rest } = chat;
          return rest;
        }),
      } };
    }
    const folders = legacyReads.store('app-folders');
    if (folders) {
      const value = JSON.parse(folders);
      legacy.stores['app-folders'] = { version: value.version ?? 0, state: { folders: value.state?.folders || [], enableFolders: true } };
    }
    for (const name of ['app-app-chat', 'app-ui'] as const) {
      const raw = legacyReads.store(name);
      if (!raw) continue;
      const value = JSON.parse(raw);
      const keys = name === 'app-app-chat'
        ? ['autoSuggestAttachmentPrompts', 'autoSuggestDiagrams', 'autoSuggestHTMLUI', 'autoSuggestQuestions', 'autoTitleChat', 'tokenCountingMethod', 'micTimeoutMs', 'phononEnabled', 'showTextDiff', 'showSystemMessages']
        : ['enterIsNewline', 'contentScaling', 'doubleClickToEdit', 'centerMode', 'complexityMode'];
      legacy.stores[name] = { version: value.version ?? 0, state: Object.fromEntries(Object.entries(value.state || {}).filter(([key]) => keys.includes(key))) };
    }
    const normalized = normalizeWorkspace(legacy);
    const referenced = workspaceAssetIds(normalized);
    const assets = new Map((await legacyReads.assets()).map(asset => [asset.id, asset]));
    // Do not install an incomplete migration or let missing originals fall through to cache hydration.
    const originals = [...referenced].map(id => {
      const asset = assets.get(id);
      if (!asset) throw new Error(`Referenced asset ${id} is missing from the browser cache. Originals were preserved.`);
      return asset;
    });
    installWorkspace(normalized, result.directory);
    for (const asset of originals) await persistAsset(asset);
    diskStorage().setItem('app-chats', normalized.stores['app-chats'] || { version: 5, state: { conversations: [] } });
    await flushDisk();
  }
  for (const store of stores) {
    await store.persist.rehydrate();
    if (!store.persist.hasHydrated()) throw new Error('Workspace store could not be loaded.');
  }
}
