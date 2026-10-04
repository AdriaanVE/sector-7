import { test } from 'node:test';
import assert from 'node:assert/strict';

// Exercise browser persistence through the Storage API used by the Labs settings.
const saved = new Map<string, string>();
Object.defineProperty(globalThis, 'window', { value: { localStorage: {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => saved.set(key, value),
  removeItem: (key: string) => saved.delete(key),
} }, configurable: true });

test('new users start with composer shortcuts hidden', async () => {
  const { useUXLabsStore } = await import('./store-ux-labs');
  assert.equal(useUXLabsStore.getState().labsShowShortcutBar, false);
});

test('older saved settings hide composer shortcuts once without changing unrelated preferences', async () => {
  const { useUXLabsStore } = await import('./store-ux-labs');
  saved.set('app-ux-labs', JSON.stringify({ version: 2, state: { labsShowShortcutBar: true, labsLosslessImages: true, labsAdaptiveRendering: 'off' } }));
  await useUXLabsStore.persist.rehydrate();
  assert.equal(useUXLabsStore.getState().labsShowShortcutBar, false);
  assert.equal(useUXLabsStore.getState().labsLosslessImages, true);
  assert.equal(useUXLabsStore.getState().labsAdaptiveRendering, 'off');
  assert.equal(JSON.parse(saved.get('app-ux-labs')!).version, 3);
});

test('old adaptive rendering migration still applies together with the shortcut migration', async () => {
  const { useUXLabsStore } = await import('./store-ux-labs');
  saved.set('app-ux-labs', JSON.stringify({ version: 1, state: { labsAdaptiveRendering: 'off', labsShowShortcutBar: true } }));
  await useUXLabsStore.persist.rehydrate();
  assert.equal(useUXLabsStore.getState().labsAdaptiveRendering, 'auto');
  assert.equal(useUXLabsStore.getState().labsShowShortcutBar, false);
});

test('enabling shortcuts after migration survives reloading saved settings', async () => {
  const { useUXLabsStore } = await import('./store-ux-labs');
  saved.set('app-ux-labs', JSON.stringify({ version: 3, state: { labsShowShortcutBar: false } }));
  await useUXLabsStore.persist.rehydrate();
  useUXLabsStore.getState().setLabsShowShortcutBar(true);
  const enabled = saved.get('app-ux-labs')!;
  useUXLabsStore.setState({ labsShowShortcutBar: false });
  saved.set('app-ux-labs', enabled);
  await useUXLabsStore.persist.rehydrate();
  assert.equal(useUXLabsStore.getState().labsShowShortcutBar, true);
});
