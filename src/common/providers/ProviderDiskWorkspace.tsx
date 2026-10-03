import { useChatRuns } from '~/common/personal/chat-run';
import { useQuestionOperations } from '~/common/personal/questions';
import { RecoveryRestore } from '~/common/personal/ProviderRecoveryControls';
import { useAppChatPanesStore } from '../../apps/chat/components/panes/store-panes-manager';
import { useAppChatStore } from '../../apps/chat/store-app-chat';
import { useUIPreferencesStore } from '~/common/stores/store-ui';
import * as React from 'react';
import { Alert, Box, Button, Modal, ModalDialog, Typography } from '@mui/joy';
import { get as idbGet } from 'idb-keyval';
import { diskStorage, flushDisk, installWorkspace, localJSON, useDiskStatus, persistAsset, downloadUnsavedWorkspaceCopy } from '~/common/personal/disk-storage';
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
  const running = useChatRuns(state => Object.keys(state.active).length);
  const answering = useQuestionOperations(state => Object.keys(state.active).length);
  const [reloading, setReloading] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [recoveryError, setRecoveryError] = React.useState('');
  const reloadLatest = async () => {
    if (running || answering || reloading || downloading) return;
    setReloading(true); setRecoveryError('');
    try {
      const result = await localJSON('workspace');
      if (!result.workspace) throw new Error('The saved workspace is missing. Keep this tab open and recover your unsaved changes.');
      validateWorkspace(result.workspace);
      window.location.reload();
    } catch (error) { setRecoveryError(error instanceof Error ? error.message : 'Could not reload the workspace.'); setReloading(false); }
  };
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
  return <>{status.error && !status.conflict && <Alert color='danger' endDecorator={<Button onClick={() => void flushDisk().catch(() => undefined)}>Retry save</Button>}>{status.error}</Alert>}{children}
    <Modal open={status.conflict} disableEscapeKeyDown>
      <ModalDialog aria-labelledby='workspace-conflict-title' sx={{ maxWidth: 560, borderRadius: 'xl', gap: 2 }}>
        <Typography id='workspace-conflict-title' level='h3'>A newer workspace was saved</Typography>
        <Typography>Changes in this tab have not been saved. Editing and new requests are paused to avoid overwriting the newer workspace.</Typography>
        <Typography>Download a recovery copy to keep these changes. Reloading replaces the unsaved changes in this tab with the saved workspace. The recovery copy is a JSON file for manual recovery, separate from ZIP backup restore.</Typography>
        {(running > 0 || answering > 0) && <Typography>Wait for active work to finish before reloading.</Typography>}
        {(recoveryError || status.error) && <Alert color='danger'>{recoveryError || status.error}</Alert>}
        <Button disabled={reloading || downloading} loading={downloading} onClick={() => { setDownloading(true); void downloadUnsavedWorkspaceCopy().catch(error => setRecoveryError(error.message)).finally(() => setDownloading(false)); }}>Download unsaved changes</Button>
        {running > 0 && <Button variant='outlined' onClick={() => { for (const chat of useChatStore.getState().conversations) if (chat._abortController) useChatStore.getState().abortConversationTemp(chat.id); }}>Stop active work</Button>}
        <Button variant='outlined' disabled={reloading || downloading || running > 0 || answering > 0} loading={reloading} onClick={() => void reloadLatest()}>Reload saved workspace</Button>
      </ModalDialog>
    </Modal>
  </>;
}
