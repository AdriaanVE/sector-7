import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intersectViewport, observeReplyEnd, replyEndFits, type ViewportRect } from './conversation-viewport';

const rect = (top: number, bottom: number, left = 0, right = 100): ViewportRect => ({ top, bottom, left, right });

test('reply end must fit the complete clipped viewport, including horizontal clipping', () => {
  const viewport = intersectViewport(rect(0, 900), rect(50, 500));
  assert.deepEqual(viewport, rect(50, 500));
  assert.equal(replyEndFits(rect(499, 500, 10, 11), viewport), true);
  for (const end of [rect(500, 501), rect(49, 50), rect(100, 101, -1, 0), rect(100, 101, 100, 101), rect(100, 100)])
    assert.equal(replyEndFits(end, viewport), false);
});

test('actual reply observer responds to scroll, focus, compositor resize and cleans up', () => {
  class Events {
    handlers = new Map<string, Set<() => void>>();
    addEventListener(name: string, action: () => void) { const handlers = this.handlers.get(name) ?? new Set(); handlers.add(action); this.handlers.set(name, handlers); }
    removeEventListener(name: string, action: () => void) { this.handlers.get(name)?.delete(action); }
    emit(name: string) { for (const action of this.handlers.get(name) ?? []) action(); }
  }
  const view = new Events();
  let end = rect(550, 551, 10, 11);
  let composerTop = 600;
  let focused = true;
  let documentVisible = true;
  let covered = false;
  let marked = 0;
  const ancestor = { parentElement: null, getBoundingClientRect: () => rect(80, 480) };
  const root = Object.assign(new Events(), {
    getBoundingClientRect: () => rect(50, 500),
    parentElement: ancestor,
    closest: () => ({ parentElement: { querySelector: () => composer } }),
  });
  const composer = { getBoundingClientRect: () => rect(composerTop, 800) };
  const parent = { contains: (node: unknown) => node === marker };
  const marker = { isConnected: true, parentElement: parent, getBoundingClientRect: () => end };
  const doc = Object.assign(new Events(), { hasFocus: () => focused, elementFromPoint: () => covered ? {} : marker });
  Object.defineProperty(doc, 'visibilityState', { get: () => documentVisible ? 'visible' : 'hidden' });
  const win = Object.assign(new Events(), { innerHeight: 900, innerWidth: 100, getComputedStyle: () => ({ overflowY: 'hidden', overflowX: 'hidden' }), visualViewport: Object.assign(view, { offsetTop: 0, offsetLeft: 0, height: 900, width: 100 }) });
  const callbacks: (() => void)[] = [];
  let disconnected = 0;
  class Observer { constructor(check: () => void) { callbacks.push(check); } observe() {} disconnect() { disconnected++; } }
  const originals = ['window', 'document', 'IntersectionObserver', 'ResizeObserver'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  try {
    for (const [name, value] of Object.entries({ window: win, document: doc, IntersectionObserver: Observer, ResizeObserver: Observer }))
      Object.defineProperty(globalThis, name, { value, configurable: true });
    const cleanup = observeReplyEnd(marker as unknown as HTMLElement, root as unknown as HTMLElement, () => marked++);
    assert.equal(marked, 0);
    end = rect(490, 491, 10, 11); callbacks[0](); assert.equal(marked, 0);
    end = rect(450, 451, 10, 11); root.emit('scroll'); assert.equal(marked, 1);
    composerTop = 400; callbacks[1](); assert.equal(marked, 1);
    composerTop = 600; focused = false; root.emit('scroll'); assert.equal(marked, 1);
    focused = true; documentVisible = false; win.emit('focus'); assert.equal(marked, 1);
    documentVisible = true; covered = true; doc.emit('visibilitychange'); assert.equal(marked, 1);
    covered = false; view.emit('resize'); assert.equal(marked, 2);
    view.emit('scroll'); win.emit('resize'); callbacks[0](); assert.equal(marked, 5);
    cleanup(); assert.equal(disconnected, 2);
    root.emit('scroll'); win.emit('focus'); doc.emit('visibilitychange'); view.emit('resize'); view.emit('scroll'); win.emit('resize');
    assert.equal(marked, 5);
  } finally {
    for (const [name, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
  }
});
