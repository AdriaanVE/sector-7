/** Capture begins before model startup so the first spoken phrase is retained. */
export async function startPhononPcm(onFrame: (pcm: ArrayBuffer) => void, autoGainControl = false) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl } });
  let context: AudioContext | undefined;
  try {
    context = new AudioContext({ sampleRate: 16000 });
    if (context.sampleRate !== 16000) throw new Error('Phonon requires a 16 kHz audio device.');
    await context.audioWorklet.addModule('/phonon-pcm-worklet.js');
    const node = new AudioWorkletNode(context, 'phonon-pcm-tap');
    const source = context.createMediaStreamSource(stream);
    let flushed: (() => void) | undefined;
    node.port.onmessage = (event: MessageEvent<Float32Array<ArrayBuffer> | 'flushed'>) => {
      if (event.data === 'flushed') flushed?.();
      else onFrame(event.data.buffer);
    };
    source.connect(node);
    // Keep the worklet in the active graph; its output is silence, never mic audio.
    node.connect(context.destination);
    await context.resume();
    const activeContext = context;
    let stopped: Promise<void> | undefined;
    let gainUpdate = Promise.resolve();
    return {
      setAutoGainControl(enabled: boolean) {
        gainUpdate = gainUpdate.catch(() => {}).then(async () => {
          if (!stopped) await Promise.all(stream.getTracks().map(track => track.applyConstraints({ autoGainControl: enabled })));
        });
        return gainUpdate;
      },
      stop() {
        return stopped ??= (async () => {
          source.disconnect();
          stream.getTracks().forEach(track => track.stop());
          const timeout = setTimeout(() => flushed?.(), 500);
          try { await new Promise<void>(resolve => { flushed = resolve; node.port.postMessage('flush'); }); }
          finally { clearTimeout(timeout); node.disconnect(); node.port.close(); await activeContext.close(); }
        })();
      },
    };
  } catch (error) {
    stream.getTracks().forEach(track => track.stop());
    await context?.close();
    throw error;
  }
}
