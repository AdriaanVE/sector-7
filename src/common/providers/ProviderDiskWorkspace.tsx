import { RecoveryRestore } from '~/common/personal/ProviderRecoveryControls';
import { useAppChatPanesStore } from '../../apps/chat/components/panes/store-panes-manager';
import { useAppChatStore } from '../../apps/chat/store-app-chat';
import { useUIPreferencesStore } from '~/common/stores/store-ui';
import * as React from 'react';
import { Alert, Box, Button, Typography } from '@mui/joy';
import { get as idbGet } from 'idb-keyval';
import { diskStorage, flushDisk, installWorkspace, localJSON, useDiskStatus, persistAsset } from '~/common/personal/disk-storage';
import { emptyWorkspace, validateWorkspace, normalizeWorkspace, workspaceAssetIds } from '~/common/personal/workspace-schema';
import { useChatStore } from '~/common/stores/chat/store-chats';
import { useFolderStore } from '~/common/stores/folders/store-chat-folders';
import { useProjectFilesStore } from '~/common/personal/store-project-files';
import { usePersonalSettings } from '~/common/personal/store-personal-settings';
import { allCachedAssets } from '~/modules/dblobs/dblobs.db';
import { useInstanceLockFlusher } from './single-tab/instanceLock';

const stores = [useChatStore, useFolderStore, useProjectFilesStore, usePersonalSettings, useAppChatStore, useUIPreferencesStore, useAppChatPanesStore];
let loading: Promise<void> | undefined;
async function initialize() {
  const result = await localJSON('workspace');
  if (result.workspace) installWorkspace(validateWorkspace(result.workspace), result.directory);
  else {
    const legacy = emptyWorkspace();
    const chats = await idbGet('app-chats');
    if (chats) {
      const value = typeof chats === 'string' ? JSON.parse(chats) : chats;
      legacy.stores['app-chats'] = { version: value.version ?? 0, state: { conversations: (value.state?.conversations || []).filter((chat: { _isIncognito?: boolean }) => !chat._isIncognito).map((chat: Record<string, unknown>) => { const { _abortController, ...rest } = chat; return rest; }) } };
    }
    const folders = localStorage.getItem('app-folders');
    if (folders) { const value = JSON.parse(folders); legacy.stores['app-folders'] = { version: value.version ?? 0, state: { folders: value.state?.folders || [], enableFolders: true } }; }
    for (const name of ['app-app-chat', 'app-ui'] as const) {
      const raw = localStorage.getItem(name); if (!raw) continue;
      const value = JSON.parse(raw);
      const keys = name === 'app-app-chat' ? ['autoSuggestAttachmentPrompts', 'autoSuggestDiagrams', 'autoSuggestHTMLUI', 'autoSuggestQuestions', 'autoTitleChat', 'tokenCountingMethod', 'micTimeoutMs', 'showTextDiff', 'showSystemMessages'] : ['enterIsNewline', 'contentScaling', 'doubleClickToEdit', 'centerMode', 'complexityMode'];
      legacy.stores[name] = { version: value.version ?? 0, state: Object.fromEntries(Object.entries(value.state || {}).filter(([key]) => keys.includes(key))) };
    }
    const normalized = normalizeWorkspace(legacy);
    installWorkspace(normalized, result.directory);
    const referenced = workspaceAssetIds(normalized);
    for (const asset of await allCachedAssets()) if (referenced.has(asset.id)) await persistAsset(asset);
    diskStorage().setItem('app-chats', normalized.stores['app-chats'] || { version: 5, state: { conversations: [] } });
    await flushDisk();
  }
  for (const store of stores) { await store.persist.rehydrate(); if (!store.persist.hasHydrated()) throw new Error('Workspace store could not be loaded.'); }
}

export function ProviderDiskWorkspace({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<'loading' | 'ready' | 'recovery'>('loading');
  const [error, setError] = React.useState('');
  useInstanceLockFlusher(flushDisk);
  const status = useDiskStatus();
  const boot = React.useCallback(() => {
    setState('loading');
    loading ??= initialize().catch(error => { loading = undefined; throw error; });
    void loading.then(() => setState('ready')).catch(error => { setError(error.message); setState('recovery'); });
  }, []);
  React.useEffect(boot, [boot]);
  if (state !== 'ready') return <Box sx={{ height: '100dvh', display: 'grid', placeContent: 'center', p: 3, gap: 2 }}>
    <Typography level='h3'>{state === 'loading' ? 'Loading your workspace' : 'Recovery required'}</Typography>
    {state === 'recovery' && <><Alert color='danger'>{error}</Alert><Button onClick={boot}>Retry loading</Button>
      <Button variant='outlined' onClick={() => { void localJSON('recover', { method: 'POST', body: '{}' }).then(() => { loading = undefined; boot(); }).catch(error => setError(error.message)); }}>Recover last good save</Button><RecoveryRestore onError={setError} /></>}
  </Box>;
  return <>{status.error && <Alert color='danger' endDecorator={<Button onClick={() => void flushDisk().catch(() => undefined)}>Retry save</Button>}>{status.error}</Alert>}{children}</>;
}
