import * as React from 'react';
import { Alert, Box, Button, Checkbox, Textarea, Typography } from '@mui/joy';
import { usePersonalSettings } from './store-personal-settings';
import { currentWorkspace, flushDisk, pauseDiskWrites, useDiskStatus, downloadWorkspaceBackup } from './disk-storage';
import { useChatAutoAI } from '../../apps/chat/store-app-chat';
import { VoiceInSettings } from '../../apps/settings-modal/VoiceInSettings';

export function PersonalSettings() {
  const settings = usePersonalSettings();
  const disk = useDiskStatus();
  const [error, setError] = React.useState('');
  const restoreInputRef = React.useRef<HTMLInputElement>(null);
  const chatAI = useChatAutoAI();
  const extras = !!(chatAI.autoSuggestDiagrams || chatAI.autoSuggestHTMLUI || chatAI.autoSuggestQuestions);
  const restore = async (file: File) => {
    try {
      await flushDisk(); pauseDiskWrites(true);
      const snapshot = currentWorkspace();
      const response = await fetch('/api/local/restore', { method: 'POST', headers: { 'X-AI-GUI': '1', 'X-Workspace-Revision': String(snapshot.revision), ...(snapshot.revisionEpoch ? { 'X-Workspace-Epoch': snapshot.revisionEpoch } : {}) }, body: file });
      if (!response.ok) throw new Error((await response.json()).error);
      window.location.reload();
    } catch (error) { setError(error instanceof Error ? error.message : 'Restore failed.'); pauseDiskWrites(false); }
  };
  return <Box sx={{ display: 'grid', gap: 3, maxWidth: 680, minWidth: 0 }}>
    <Box component='section' sx={{ display: 'grid', gap: 1.5 }}>
      <Typography level='title-md'>Voice input</Typography>
      <VoiceInSettings isMobile={false} />
    </Box>
    <Box component='section' sx={{ display: 'grid', gap: 1.5 }}>
      <Typography level='title-md'>Personal instructions</Typography>
      <Textarea minRows={5} value={settings.instructions} aria-label='Personal instructions' sx={{
        backgroundColor: 'rgba(var(--joy-palette-neutral-darkChannel) / 0.55)',
        borderColor: 'rgba(168, 85, 247, .42)',
        color: 'text.primary',
        '&:hover': { borderColor: 'rgba(168, 85, 247, .7)' },
        '@media (forced-colors: active)': { backgroundColor: 'Canvas', borderColor: 'CanvasText', color: 'CanvasText' },
      }} onChange={event => settings.setInstructions(event.target.value)} />
      <Typography level='body-sm' sx={{ color: 'text.tertiary' }}>Instructions apply to future requests. Project and edited chat instructions follow these.</Typography>
    </Box>
    <Box component='section' sx={{ display: 'grid', gap: 1.5, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
      <Typography level='title-md'>Conversation</Typography>
      <Typography level='body-sm' sx={{ color: 'text.tertiary' }}>Every chat can manage skills in ~/.claude and ~/.codex and run local commands with the app’s permissions. Projects add their connected folders.</Typography>
      <Checkbox label='Show all tool calls' checked={settings.showToolCalls} onChange={event => settings.setShowToolCalls(event.target.checked)} />
      <Typography level='body-sm' sx={{ color: 'text.tertiary' }}>Show tool inputs, results and logs in messages. Hidden by default; a concise activity line shows what is happening.</Typography>
    </Box>
    <Box component='section' sx={{ display: 'grid', gap: 1.5, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
      <Typography level='title-md'>AI extras</Typography>
      <Checkbox label='Automatic AI extras' checked={extras} onChange={event => { chatAI.setAutoSuggestDiagrams(event.target.checked); chatAI.setAutoSuggestHTMLUI(event.target.checked); chatAI.setAutoSuggestQuestions(event.target.checked); chatAI.setAutoSuggestAttachmentPrompts(event.target.checked); }} />
      <Box component='ul' sx={{ m: 0, pl: 2.25, display: 'grid', gap: 0.75, color: 'text.tertiary', fontSize: 'sm', lineHeight: 1.6 }}>
        <li>Automatic suggestions use Sonnet 5.5 with medium effort.</li>
        <li>Image generation is unconfigured. Choose a server-side image connection in a later setup.</li>
      </Box>
    </Box>
    <Box component='section' sx={{ display: 'grid', gap: 1.5, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
      <Typography level='title-md'>Workspace data</Typography>
      <Typography level='body-sm' sx={{ fontFamily: 'code', overflowWrap: 'anywhere', color: 'text.secondary' }}>{disk.directory}</Typography>
      <Typography level='body-sm' sx={{ color: 'text.tertiary' }}>{disk.lastSaved ? `Last saved ${new Date(disk.lastSaved).toLocaleTimeString()}` : 'No save confirmed in this session.'}</Typography>
      {(error || disk.error) && <Alert color='danger'>{error || disk.error}</Alert>}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        <Button size='sm' onClick={() => { void downloadWorkspaceBackup().catch(error => setError(error.message)); }}>Download backup</Button>
        <Button size='sm' variant='outlined' color='neutral' onClick={() => restoreInputRef.current?.click()}>Restore backup</Button>
        <input ref={restoreInputRef} hidden type='file' accept='.zip' onChange={event => { const file = event.target.files?.[0]; if (file) void restore(file); }} />
      </Box>
    </Box>
  </Box>;
}
