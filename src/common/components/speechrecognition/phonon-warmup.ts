/** Warm the model without microphone access. Call before starting dictation. */
export async function warmPhonon() {
  const phonon = window.sector7Desktop?.phonon;
  if (!phonon) throw new Error('Phonon is available only in Sector 7 Desktop.');
  const { url } = await phonon.ensure();
  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => finish(new Error('Phonon warm-up timed out. See phonon.log.')), 180000);
    function finish(error?: Error) {
      clearTimeout(timeout);
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      socket.close();
      if (error) reject(error); else resolve();
    }
    socket.onopen = () => {
      socket.send(JSON.stringify({ sample_rate: 16000, format: 'pcm_f32le' }));
      socket.send(JSON.stringify({ type: 'end' }));
    };
    socket.onmessage = event => {
      try {
        const message: unknown = JSON.parse(event.data);
        if (message && typeof message === 'object' && 'type' in message) {
          if (message.type === 'done') finish();
          else if (message.type === 'error' && 'message' in message && typeof message.message === 'string')
            finish(new Error(message.message.startsWith('engine busy') ? 'Stop dictation before warming Phonon.' : message.message));
        }
      } catch { finish(new Error('Phonon returned an invalid warm-up event.')); }
    };
    socket.onclose = () => finish(new Error('Phonon warm-up stream stopped. Try again.'));
    socket.onerror = () => finish(new Error('Phonon warm-up could not connect. See phonon.log.'));
  });
}
