import * as React from 'react';
import { Alert, FormControl, Typography } from '@mui/joy';
import { useShallow } from 'zustand/react/shallow';

import { useAppChatStore, useChatMicTimeoutMs } from '../chat/store-app-chat';
import type { FormRadioOption } from '~/common/components/forms/FormRadioControl';
import { FormChipControl } from '~/common/components/forms/FormChipControl';
import { FormLabelStart } from '~/common/components/forms/FormLabelStart';
import { FormSwitchControl } from '~/common/components/forms/FormSwitchControl';
import { LanguageSelect } from '~/common/components/LanguageSelect';

const _minTimeouts: ReadonlyArray<FormRadioOption<string>> = [
  { value: '600', label: '0.6s', description: 'Snappy' },
  { value: '2000', label: '2s', description: 'Standard' },
  { value: '5000', label: '5s', description: 'Breathe' },
  { value: '15000', label: '15s', description: 'Best for thinking' },
];

type PhononStatus = Awaited<ReturnType<NonNullable<Window['sector7Desktop']>['phonon']['status']>>;

export function VoiceInSettings(props: { isMobile: boolean }) {
  const [chatTimeoutMs, setChatTimeoutMs] = useChatMicTimeoutMs();
  const [enabled, setEnabled] = useAppChatStore(useShallow(state => [state.phononEnabled, state.setPhononEnabled]));
  const [status, setStatus] = React.useState<PhononStatus | null>(null);
  const [error, setError] = React.useState('');
  const [changing, setChanging] = React.useState(false);
  const phonon = typeof window !== 'undefined' ? window.sector7Desktop?.phonon : undefined;

  React.useEffect(() => {
    if (!phonon) return;
    let live = true;
    const refresh = () => { void phonon.status().then(status => { if (live) setStatus(status); }).catch(() => { if (live) setError('Phonon status could not load.'); }); };
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => { live = false; clearInterval(timer); };
  }, [phonon]);

  const toggle = async (on: boolean) => {
    setChanging(true); setError('');
    setEnabled(on);
    try {
      if (!on) await phonon?.stop();
      if (phonon) setStatus(await phonon.status());
    } catch (error) { setError(error instanceof Error ? error.message : 'Phonon could not stop.'); }
    finally { setChanging(false); }
  };
  const statusLabel = !enabled ? 'Off' : !status ? 'Loading status...' : {
    idle: 'Idle', starting: 'Starting', running: 'Running', 'not-installed': 'Not installed',
  }[status.state];

  return <>
    {phonon ? <>
      <FormSwitchControl title='Phonon-2 dictation' description='Local, English only. Command and port: config.json.'
        checked={enabled} onChange={on => { void toggle(on); }} disabled={!status || changing} on={statusLabel} off='Off' />
      {enabled && status?.message && <Alert color={status.state === 'not-installed' ? 'warning' : 'neutral'} sx={{ overflowWrap: 'anywhere' }}>{status.message}</Alert>}
      {error && <Alert color='danger'>{error}</Alert>}
    </> : <Typography level='body-sm' sx={{ color: 'text.tertiary' }}>Chrome dictation uses Web Speech and sends audio to Google.</Typography>}
    <FormControl orientation='horizontal' sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <FormLabelStart title='Language' description={phonon ? 'Phonon always uses English' : 'Mic and voice'} />
      <LanguageSelect />
    </FormControl>
    {!props.isMobile && <FormChipControl title='Mic Timeout' tooltip='Silence that ends a dictation.'
      options={_minTimeouts} value={String(chatTimeoutMs)} onChange={value => { if (value) setChatTimeoutMs(Number(value)); }} />}
  </>;
}
