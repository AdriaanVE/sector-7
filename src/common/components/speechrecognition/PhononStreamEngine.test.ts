import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { PhononStreamEngine } from './PhononStreamEngine';
import type { SpeechRecognitionState, SpeechResult } from './useSpeechRecognition';

const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };

function browser(t: TestContext) {
  const sockets: Socket[] = [];
  const worklets: Worklet[] = [];
  let stopped = 0;
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
  class Context {
    sampleRate = 16000;
    destination = {};
    audioWorklet = { addModule: async () => {} };
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    async resume() {}
    async close() {}
  }
  const descriptors = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({
    window: { sector7Desktop: { phonon: { ensure: () => startup } } },
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { stopped++; } }] }) } },
    AudioContext: Context, AudioWorkletNode: Worklet, WebSocket: Socket,
  })) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  t.after(() => { for (const [name, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  } });
  return { sockets, worklets, ready: () => resolveStartup({ url: 'ws://127.0.0.1:8010/v1/audio/stream?api_key=fixture' }), stopped: () => stopped };
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
