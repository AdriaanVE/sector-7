import { applyPhononEvent, parsePhononEvent } from './phonon-events';
import { startPhononPcm } from './phonon-pcm';
import { createSpeechRecognitionResults } from './useSpeechRecognition';
import type { IRecognitionEngine, SpeechDoneReason, SpeechRecognitionState, SpeechResult } from './useSpeechRecognition';

export class PhononStreamEngine implements IRecognitionEngine {
  readonly engineType = 'phononStream';
  private results = createSpeechRecognitionResults();
  private active = false;
  private enabled = true;
  private disposed = false;
  private stopping = false;
  private captureStopped = false;
  private streamReady = false;
  private endSent = false;
  private session = 0;
  private socket?: WebSocket;
  private captureStarting?: ReturnType<typeof startPhononPcm>;
  private frames: ArrayBuffer[] = [];
  private inactivityTimer?: ReturnType<typeof setTimeout>;
  private deadlineTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private softStopTimeout: number,
    private onResult: (result: SpeechResult) => void,
    private setState: (state: Partial<SpeechRecognitionState>) => void,
  ) {
    setState({ isAvailable: !!window.sector7Desktop?.phonon });
  }

  start() {
    if (this.active || this.disposed || !this.enabled) return;
    this.active = true;
    this.stopping = false;
    this.captureStopped = this.streamReady = this.endSent = false;
    this.results = { ...createSpeechRecognitionResults(), interimTranscript: 'Starting Phonon...' };
    this.setState({ isActive: true, errorMessage: null });
    this.onResult(this.results);
    const session = ++this.session;
    void this.begin(session).catch(error => {
      if (this.active && this.session === session) this.fail(error instanceof Error ? error.message : 'Phonon could not start.');
    });
  }

  private async begin(session: number) {
    const phonon = window.sector7Desktop?.phonon;
    if (!phonon) throw new Error('Phonon is available only in Sector 7 Desktop.');
    this.captureStarting = startPhononPcm(frame => {
      if (!this.active || this.session !== session) return;
      if (!this.streamReady || this.socket?.readyState !== WebSocket.OPEN) {
        // Three minutes matches the model startup deadline (about 12 MB of PCM).
        if (this.frames.length >= 1800) { this.fail('Phonon startup audio buffer is full. Try the mic again.'); return; }
        this.frames.push(frame);
        return;
      }
      if (this.socket.bufferedAmount > 16 * 1024 * 1024) { this.fail('Phonon cannot keep up with microphone audio. Try the mic again.'); return; }
      this.socket.send(frame);
    });
    const capture = await this.captureStarting;
    if (!this.active || this.session !== session) { await capture.stop(); return; }
    if (!this.stopping) this.setState({ hasAudio: true });
    const { url } = await phonon.ensure();
    if (!this.active || this.session !== session) return;
    const socket = new WebSocket(url);
    this.socket = socket;
    this.deadlineTimer = setTimeout(() => this.fail('Phonon stream did not connect. See phonon.log in Help > Open Logs Folder.'), 10000);
    socket.onopen = () => {
      if (!this.active || this.session !== session) { socket.close(); return; }
      clearTimeout(this.deadlineTimer);
      this.deadlineTimer = undefined;
      socket.send(JSON.stringify({ sample_rate: 16000, format: 'pcm_f32le' }));
      for (const frame of this.frames) socket.send(frame);
      this.frames = [];
      this.streamReady = true;
      this.results = { ...this.results, interimTranscript: this.stopping ? 'Finishing Phonon...' : 'Listening...' };
      this.onResult(this.results);
      if (this.stopping && this.captureStopped) this.endStream();
    };
    socket.onmessage = event => {
      if (!this.active || this.session !== session) return;
      try {
        const message = parsePhononEvent(event.data);
        if (message.type === 'error') {
          this.fail(message.message.startsWith('engine busy') ? 'Phonon is already transcribing another stream.' : message.message);
          return;
        }
        this.results = applyPhononEvent(this.results, message);
        this.setState({ hasSpeech: message.type !== 'done' && !!(this.results.transcript.trim() || this.results.interimTranscript) });
        if (this.results.done) this.finish();
        else { this.onResult(this.results); this.resetInactivity(); }
      } catch { this.fail('Phonon returned an invalid stream event. See phonon.log in Help > Open Logs Folder.'); }
    };
    socket.onerror = () => { /* Close carries the busy code; otherwise the connection deadline bounds failure. */ };
    socket.onclose = event => {
      if (this.active && this.session === session) this.fail(event.code === 1013
        ? 'Phonon is already transcribing another stream.'
        : 'Phonon stream stopped unexpectedly. Try the mic again to restart it. See phonon.log in Help > Open Logs Folder.');
    };
  }

  stop(reason: SpeechDoneReason, sendOnDone: boolean) {
    if (!this.active || this.stopping) return;
    this.stopping = true;
    this.results = { ...this.results, doneReason: reason, flagSendOnDone: sendOnDone };
    clearTimeout(this.inactivityTimer);
    const session = this.session;
    void this.stopCapture().then(() => {
      if (!this.active || this.session !== session) return;
      this.setState({ hasAudio: false });
      this.captureStopped = true;
      if (this.streamReady) this.endStream();
    }).catch(() => { if (this.active && this.session === session) this.fail('Microphone capture could not stop cleanly. Finalized text was kept.'); });
  }

  dispose() {
    this.disposed = true;
    this.active = false;
    this.cleanup();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled && this.active) {
      this.results = { ...this.results, doneReason: 'switch-engine', flagSendOnDone: false };
      this.finish();
    }
    this.setState({ isAvailable: enabled });
  }

  isBetweenBeginEnd() { return this.active; }

  updateConfiguration(_language: string, softStopTimeout: number, onResult: (result: SpeechResult) => void) {
    this.softStopTimeout = softStopTimeout;
    this.onResult = onResult;
  }

  private resetInactivity() {
    clearTimeout(this.inactivityTimer);
    if (!this.stopping && this.softStopTimeout > 0) this.inactivityTimer = setTimeout(() => this.stop('continuous-deadline', false), this.softStopTimeout);
  }

  private endStream() {
    if (this.endSent) return;
    this.endSent = true;
    this.socket?.send(JSON.stringify({ type: 'end' }));
    clearTimeout(this.deadlineTimer);
    this.deadlineTimer = setTimeout(() => this.fail('Phonon did not finish the transcript. Finalized text was kept. See phonon.log.'), 30000);
  }

  private fail(message: string) {
    if (!this.active || this.disposed) return;
    this.results = applyPhononEvent(this.results, { type: 'error', message });
    this.setState({ errorMessage: message });
    this.finish();
  }

  private finish() {
    this.active = false;
    this.results = { ...this.results, interimTranscript: '', done: true };
    this.cleanup();
    if (!this.disposed) {
      this.setState({ isActive: false, hasAudio: false, hasSpeech: false });
      this.onResult(this.results);
    }
  }

  private async stopCapture() {
    const starting = this.captureStarting;
    const capture = await starting?.catch(() => undefined);
    if (this.captureStarting === starting) this.captureStarting = undefined;
    await capture?.stop();
  }

  private cleanup() {
    clearTimeout(this.inactivityTimer);
    clearTimeout(this.deadlineTimer);
    if (this.socket) {
      this.socket.onopen = this.socket.onmessage = this.socket.onclose = this.socket.onerror = null;
      this.socket.close(); this.socket = undefined;
    }
    this.frames = [];
    this.streamReady = false;
    void this.stopCapture().catch(() => {});
  }
}
