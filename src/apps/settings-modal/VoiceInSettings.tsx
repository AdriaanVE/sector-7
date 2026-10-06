import * as React from 'react';
import { Alert, Box, Button, FormControl, Slider, Typography } from '@mui/joy';
import { useShallow } from 'zustand/react/shallow';

import { useAppChatStore, useChatMicTimeoutMs } from '../chat/store-app-chat';
import type { FormRadioOption } from '~/common/components/forms/FormRadioControl';
import { FormChipControl } from '~/common/components/forms/FormChipControl';
import { FormLabelStart } from '~/common/components/forms/FormLabelStart';
import { FormSwitchControl } from '~/common/components/forms/FormSwitchControl';
import { LanguageSelect } from '~/common/components/LanguageSelect';
import { defaultPhononInputSettings } from '~/common/components/speechrecognition/phonon-input-settings';
import { warmPhonon } from '~/common/components/speechrecognition/phonon-warmup';

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
  const [input, setInput] = useAppChatStore(useShallow(state => [state.phononInputSettings, state.setPhononInputSettings]));
  const [status, setStatus] = React.useState<PhononStatus | null>(null);
  const [error, setError] = React.useState('');
  const [changing, setChanging] = React.useState(false);
  const [warming, setWarming] = React.useState(false);
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
  const warmUp = async () => {
    setWarming(true); setError('');
    try { await warmPhonon(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Phonon could not warm up.'); }
    finally { setWarming(false); }
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
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button size='sm' variant='outlined' color='neutral' disabled={!enabled || warming || changing} loading={warming} onClick={() => { void warmUp(); }}>
          Warm up now
        </Button>
        <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>Load the model before dictation. No microphone recording.</Typography>
      </Box>
      <Box sx={{ display: 'grid', gap: 2, pl: { sm: 2 }, borderLeft: { sm: '2px solid' }, borderColor: 'divider' }}>
        <Typography level='body-sm' sx={{ color: 'text.tertiary' }}>Changes apply while you dictate. Increase the noise threshold if silence produces words; lower it if quiet speech is missed.</Typography>
        <Box>
          <FormLabelStart title='Noise threshold' description={`${(input.noiseFloor * 100).toFixed(1)}% · higher blocks more background noise`} />
          <Slider aria-label='Noise threshold' min={0} max={10} step={0.1} value={input.noiseFloor * 100} disabled={!enabled}
            valueLabelDisplay='auto' valueLabelFormat={value => `${value.toFixed(1)}%`}
            onChange={(_event, value) => { if (typeof value === 'number') setInput({ noiseFloor: value / 100 }); }} />
        </Box>
        <Box>
          <FormLabelStart title='Speech lead-in' description={`${input.leadInMs} ms · keeps the beginning of quiet words`} />
          <Slider aria-label='Speech lead-in' min={0} max={300} step={50} value={input.leadInMs} disabled={!enabled}
            valueLabelDisplay='auto' valueLabelFormat={value => `${value} ms`}
            onChange={(_event, value) => { if (typeof value === 'number') setInput({ leadInMs: value }); }} />
        </Box>
        <Box>
          <FormLabelStart title='Speech tail' description={`${input.tailMs} ms · keeps quiet word endings after speech`} />
          <Slider aria-label='Speech tail' min={0} max={1000} step={50} value={input.tailMs} disabled={!enabled}
            valueLabelDisplay='auto' valueLabelFormat={value => `${value} ms`}
            onChange={(_event, value) => { if (typeof value === 'number') setInput({ tailMs: value }); }} />
        </Box>
        <FormSwitchControl title='Automatic mic gain' description='Boosts quiet audio, including room noise. Off is recommended.' checked={input.autoGainControl}
          disabled={!enabled} onChange={autoGainControl => setInput({ autoGainControl })} />
        <Button size='sm' variant='outlined' color='neutral' sx={{ justifySelf: 'start' }} onClick={() => setInput(defaultPhononInputSettings)}>Reset input defaults</Button>
      </Box>
    </> : <Typography level='body-sm' sx={{ color: 'text.tertiary' }}>Chrome dictation uses Web Speech and sends audio to Google.</Typography>}
    <FormControl orientation='horizontal' sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <FormLabelStart title='Language' description={phonon ? 'Phonon always uses English' : 'Mic and voice'} />
      <LanguageSelect />
    </FormControl>
    {!props.isMobile && <FormChipControl title='Pause before stopping' tooltip='How long dictation waits after the last transcript update. Increase this if it stops before you finish thinking.'
      options={_minTimeouts} value={String(chatTimeoutMs)} onChange={value => { if (value) setChatTimeoutMs(Number(value)); }} />}
  </>;
}
