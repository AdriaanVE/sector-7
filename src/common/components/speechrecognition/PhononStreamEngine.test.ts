import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { PhononStreamEngine } from './PhononStreamEngine';
import type { SpeechRecognitionState, SpeechResult } from './useSpeechRecognition';

const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };

function browser(t: TestContext, options: { capturePending?: boolean; rejectGain?: boolean } = {}) {
  const sockets: Socket[] = [];
  const worklets: Worklet[] = [];
  let stopped = 0;
  const gainChanges: boolean[] = [];
  let resolveStartup: (value: { url: string }) => void = () => {};
  const startup = new Promise<{ url: string }>(resolve => { resolveStartup = resolve; });
  class Socket {
    static OPEN = 1;
    readyState = 0;
    bufferedAmount = 0;
    sent: (string | ArrayBuffer)[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: ((event: { code: number }) => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() { sockets.push(this); }
    send(data: string | ArrayBuffer) { this.sent.push(data); }
    close() { this.readyState = 3; }
    open() { this.readyState = 1; this.onopen?.(); }
    event(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
  }
  class Worklet {
    port = {
      onmessage: null as ((event: { data: Float32Array | string }) => void) | null,
      postMessage: () => {
        this.port.onmessage?.({ data: new Float32Array([0.25]) });
        this.port.onmessage?.({ data: 'flushed' });
      },
      close() {},
    };
    constructor() { worklets.push(this); }
    connect() {}
    disconnect() {}
    audio() { this.port.onmessage?.({ data: new Float32Array([0.5]) }); }
  }
  let resolveCapture: () => void = () => {};
  const captureReady = new Promise<void>(resolve => { resolveCapture = resolve; });
  class Context {
    sampleRate = 16000;
    destination = {};
    audioWorklet = { addModule: async () => {} };
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    async resume() { if (options.capturePending) await captureReady; }
    async close() {}
  }
  const descriptors = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({
    window: { sector7Desktop: { phonon: { ensure: () => startup } } },
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { stopped++; }, applyConstraints: async (value: MediaTrackConstraints) => { gainChanges.push(value.autoGainControl === true); if (options.rejectGain) throw new Error('unsupported gain'); } }] }) } },
    AudioContext: Context, AudioWorkletNode: Worklet, WebSocket: Socket,
  })) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  t.after(() => { for (const [name, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  } });
  return { sockets, worklets, captureReady: resolveCapture, ready: () => resolveStartup({ url: 'ws://127.0.0.1:8010/v1/audio/stream?api_key=fixture' }), stopped: () => stopped, gainChanges: () => gainChanges };
}

test('manual stop during startup sends buffered PCM before end and keeps authoritative done text', async t => {
  const fixture = browser(t);
  const results: SpeechResult[] = [];
  const engine = new PhononStreamEngine(2000, result => results.push(result), () => {});
  t.after(() => engine.dispose());
  engine.start();
  await settle();
  fixture.worklets[0].audio();
  engine.stop('manual', false);
  await settle();
  assert.equal(fixture.stopped(), 1);
  assert.equal(engine.isBetweenBeginEnd(), true);
  fixture.ready();
  await settle();
  const socket = fixture.sockets[0]; socket.open();
  assert.equal(socket.sent[0], '{"sample_rate":16000,"format":"pcm_f32le"}');
  assert.ok(socket.sent[1] instanceof ArrayBuffer);
  assert.ok(socket.sent[2] instanceof ArrayBuffer);
  assert.equal(socket.sent[3], '{"type":"end"}');
  socket.event({ type: 'done', text: 'Buffered phrase.' });
  assert.equal(results.at(-1)?.transcript, 'Buffered phrase.');
  assert.equal(results.at(-1)?.doneReason, 'manual');
  assert.equal(engine.isBetweenBeginEnd(), false);
});

test('silence deadline waits for done; busy close preserves final text and shows the error', async t => {
  const fixture = browser(t);
  const results: SpeechResult[] = [];
  let state: Partial<SpeechRecognitionState> = {};
  const engine = new PhononStreamEngine(2000, result => results.push(result), update => { state = { ...state, ...update }; });
  t.after(() => engine.dispose());
  engine.start(); await settle(); fixture.ready(); await settle();
  const socket = fixture.sockets[0]; socket.open();
  socket.event({ type: 'final', text: 'Keep this.', segment: 1 });
  socket.event({ type: 'partial', text: 'unfinished' });
  engine.stop('continuous-deadline', false); await settle();
  assert.equal(results.at(-1)?.done, false);
  assert.equal(socket.sent.at(-1), '{"type":"end"}');
  socket.event({ type: 'error', message: 'engine busy \u2014 one stream at a time' });
  socket.onclose?.({ code: 1013 });
  assert.equal(results.at(-1)?.transcript, 'Keep this. ');
  assert.equal(results.at(-1)?.doneReason, 'api-error');
  assert.equal(state.errorMessage, 'Phonon is already transcribing another stream.');
  assert.equal(state.isActive, false);
});

test('every partial resets the silence timer and expiry sends end before reporting done', async t => {
  const fixture = browser(t);
  const results: SpeechResult[] = [];
  const engine = new PhononStreamEngine(2000, result => results.push(result), () => {});
  t.after(() => engine.dispose());
  t.mock.timers.enable({ apis: ['setTimeout'] });
  engine.start(); await settle(); fixture.ready(); await settle();
  const socket = fixture.sockets[0]; socket.open();
  socket.event({ type: 'partial', text: 'first phrase' });
  t.mock.timers.tick(1999);
  socket.event({ type: 'partial', text: 'longer phrase' });
  t.mock.timers.tick(1999);
  assert.equal(socket.sent.some(value => value === '{"type":"end"}'), false);
  t.mock.timers.tick(1); await settle();
  assert.equal(socket.sent.at(-1), '{"type":"end"}');
  assert.equal(results.at(-1)?.done, false);
  socket.event({ type: 'done', text: 'Longer phrase.' });
  assert.equal(results.at(-1)?.doneReason, 'continuous-deadline');
  assert.equal(results.at(-1)?.transcript, 'Longer phrase.');
});

test('disable preserves finalized text and prevents a pending startup from opening a socket', async t => {
  const fixture = browser(t);
  const results: SpeechResult[] = [];
  let available = true;
  const engine = new PhononStreamEngine(2000, result => results.push(result), update => { if (update.isAvailable !== undefined) available = update.isAvailable; });
  t.after(() => engine.dispose());
  engine.start(); await settle();
  engine.setEnabled(false); await settle();
  fixture.ready(); await settle();
  assert.equal(fixture.sockets.length, 0);
  assert.equal(fixture.stopped(), 1);
  assert.equal(available, false);
  assert.equal(results.at(-1)?.done, true);
  engine.start(); await settle();
  assert.equal(fixture.worklets.length, 1);
});

test('model warm-up does not spend the silence timeout before the first speech event', async t => {
  const fixture = browser(t);
  const results: SpeechResult[] = [];
  const engine = new PhononStreamEngine(2000, result => results.push(result), () => {});
  t.after(() => engine.dispose());
  t.mock.timers.enable({ apis: ['setTimeout'] });
  engine.start(); await settle(); fixture.ready(); await settle();
  const socket = fixture.sockets[0]; socket.open();
  t.mock.timers.tick(5000); await settle();
  assert.equal(fixture.stopped(), 0);
  assert.equal(socket.sent.some(value => value === '{"type":"end"}'), false);
  fixture.worklets[0].audio();
  socket.event({ type: 'partial', text: 'after warm-up' });
  t.mock.timers.tick(2000); await settle();
  assert.equal(socket.sent.at(-1), '{"type":"end"}');
  socket.event({ type: 'done', text: 'After warm-up.' });
  assert.equal(results.at(-1)?.transcript, 'After warm-up.');
});

test('quiet microphone noise reaches Phonon as silence, while speech and word boundaries remain intact', async t => {
  const fixture = browser(t);
  const engine = new PhononStreamEngine(2000, () => {}, () => {});
  t.after(() => engine.dispose());
  engine.start(); await settle(); fixture.ready(); await settle();
  const socket = fixture.sockets[0]; socket.open();
  const noise = new Float32Array(1600).fill(0.008);
  const speech = new Float32Array(1600).fill(0.08);
  const emit = (frame: Float32Array) => fixture.worklets[0].port.onmessage?.({ data: frame });
  emit(noise);
  emit(noise);
  const audio = () => socket.sent.filter((frame): frame is ArrayBuffer => frame instanceof ArrayBuffer).map(frame => new Float32Array(frame));
  assert.equal(audio().length, 2);
  assert.ok(audio().every(frame => frame.every(sample => sample === 0)));
  emit(speech);
  assert.equal(audio().length, 4);
  assert.ok(audio().at(-2)?.every(sample => Math.abs(sample - 0.008) < 0.00001));
  assert.ok(audio().at(-1)?.every(sample => Math.abs(sample - 0.08) < 0.00001));
  emit(noise); // Quiet word ending stays within the short hangover.
  assert.ok(audio().at(-1)?.some(sample => sample !== 0));
  for (let i = 0; i < 7; i++) emit(noise);
  assert.ok(audio().at(-1)?.every(sample => sample === 0));
});

test('changing input settings during dictation updates the gate and microphone gain immediately', async t => {
  const fixture = browser(t);
  const engine = new PhononStreamEngine(2000, () => {}, () => {});
  t.after(() => engine.dispose());
  engine.start(); await settle(); fixture.ready(); await settle();
  const socket = fixture.sockets[0]; socket.open();
  const emit = () => fixture.worklets[0].port.onmessage?.({ data: new Float32Array(1600).fill(0.008) });
  const audio = () => socket.sent.filter((frame): frame is ArrayBuffer => frame instanceof ArrayBuffer).map(frame => new Float32Array(frame));
  emit();
  assert.ok(audio().at(-1)?.every(sample => sample === 0));
  await engine.setInputSettings({ noiseFloor: 0.004, leadInMs: 0, tailMs: 0, autoGainControl: true });
  emit();
  assert.ok(audio().at(-1)?.every(sample => sample > 0));
  await engine.setInputSettings({ noiseFloor: 0.02, leadInMs: 0, tailMs: 0, autoGainControl: false });
  emit();
  assert.ok(audio().at(-1)?.every(sample => sample === 0));
  assert.equal(fixture.sockets.length, 1);
  assert.equal(fixture.stopped(), 0);
  assert.deepEqual(fixture.gainChanges(), [true, false]);
});

test('speech lead-in and tail settings preserve the chosen audio durations', async t => {
  const fixture = browser(t);
  const engine = new PhononStreamEngine(2000, () => {}, () => {});
  t.after(() => engine.dispose());
  await engine.setInputSettings({ noiseFloor: 0.015, leadInMs: 200, tailMs: 600, autoGainControl: false });
  engine.start(); await settle(); fixture.ready(); await settle();
  const socket = fixture.sockets[0]; socket.open();
  const emit = (value: number) => fixture.worklets[0].port.onmessage?.({ data: new Float32Array(1600).fill(value) });
  emit(0.001); emit(0.002); emit(0.003); emit(0.08);
  const audio = () => socket.sent.filter((frame): frame is ArrayBuffer => frame instanceof ArrayBuffer).map(frame => new Float32Array(frame));
  assert.equal(audio().at(-2)?.length, 3200);
  assert.ok(audio().at(-2)?.slice(0, 1600).every(sample => Math.abs(sample - 0.002) < 0.00001));
  assert.ok(audio().at(-2)?.slice(1600).every(sample => Math.abs(sample - 0.003) < 0.00001));
  for (let i = 0; i < 6; i++) emit(0.008);
  assert.ok(audio().slice(-6).every(frame => frame.some(sample => sample > 0)));
  emit(0.008);
  assert.ok(audio().at(-1)?.every(sample => sample === 0));
});

test('manual warm-up primes Phonon without microphone capture', async t => {
  const fixture = browser(t);
  const { warmPhonon } = await import('./phonon-warmup');
  const warmed = warmPhonon();
  fixture.ready(); await settle();
  const socket = fixture.sockets[0]; socket.open();
  assert.deepEqual(socket.sent, ['{"sample_rate":16000,"format":"pcm_f32le"}', '{"type":"end"}']);
  assert.equal(fixture.worklets.length, 0);
  socket.event({ type: 'done', text: '' });
  await warmed;
  assert.equal(socket.readyState, 3);
});


test('changing the pause timeout in a reused session waits for its first transcript event', async t => {
  const fixture = browser(t);
  const engine = new PhononStreamEngine(2000, () => {}, () => {});
  t.after(() => engine.dispose());
  t.mock.timers.enable({ apis: ['setTimeout'] });
  engine.start(); await settle(); fixture.ready(); await settle();
  const first = fixture.sockets[0]; first.open();
  first.event({ type: 'partial', text: 'first session' });
  first.event({ type: 'done', text: 'First session.' });
  engine.start(); await settle();
  engine.updateConfiguration('en-US', 600, () => {});
  const second = fixture.sockets[1]; second.open();
  t.mock.timers.tick(601); await settle();
  assert.equal(fixture.stopped(), 1);
  assert.equal(second.sent.some(value => value === '{"type":"end"}'), false);
  second.event({ type: 'partial', text: 'second session' });
  t.mock.timers.tick(600); await settle();
  assert.equal(second.sent.at(-1), '{"type":"end"}');
});

test('a rejected gain change during capture startup is applied once and leaves dictation running', async t => {
  const fixture = browser(t, { capturePending: true, rejectGain: true });
  const engine = new PhononStreamEngine(2000, () => {}, () => {});
  t.after(() => engine.dispose());
  engine.start(); await settle();
  const gainUpdate = engine.setInputSettings({ noiseFloor: 0.015, leadInMs: 100, tailMs: 600, autoGainControl: true });
  const rejected = assert.rejects(gainUpdate, /unsupported gain/);
  fixture.captureReady(); fixture.ready(); await settle();
  await rejected;
  assert.deepEqual(fixture.gainChanges(), [true]);
  assert.equal(engine.isBetweenBeginEnd(), true);
  assert.equal(fixture.sockets.length, 1);
});
