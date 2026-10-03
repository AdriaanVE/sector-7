import { localJSON } from './disk-storage';
import * as React from 'react';
import { Button } from '@mui/joy';
export function RecoveryRestore({ onError }: { onError: (error: string) => void }) {
  return <Button component='label' variant='outlined'>Restore backup<input hidden type='file' accept='.zip' onChange={event => {
    const file = event.target.files?.[0]; if (!file) return;
    void (async () => {
      const { revision, revisionEpoch } = await localJSON('workspace?recovery=1');
      return fetch('/api/local/restore', { method: 'POST', headers: { 'X-AI-GUI': '1', 'X-Workspace-Revision': String(revision), ...(revisionEpoch ? { 'X-Workspace-Epoch': revisionEpoch } : {}) }, body: file });
    })()
      .then(async response => { if (!response.ok) throw new Error((await response.json()).error); window.location.reload(); })
      .catch(error => onError(error.message));
  }} /></Button>;
}
