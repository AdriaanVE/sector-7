import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectNativeFolder, type DesktopFolderPicker } from './native-folder-selection';

test('browser requests the server picker and desktop validates only the selected path', async () => {
  const fetchBefore = globalThis.fetch;
  const requests: unknown[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/local/folders');
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({ folder: { path: '/canonical/folder' } });
  };
  try {
    const signal = new AbortController().signal;
    assert.deepEqual(await selectNativeFolder(signal), { folder: { path: '/canonical/folder' } });
    const desktop: DesktopFolderPicker = {
      pickFolder: async id => { assert.match(id, /^[a-f0-9-]{36}$/); return { path: '/selected/folder \n ' }; },
      cancelFolderPicker: () => assert.fail('Unexpected cancellation'),
    };
    assert.deepEqual(await selectNativeFolder(signal, desktop), { folder: { path: '/canonical/folder' } });
    assert.deepEqual(requests, [{ action: 'pick' }, { action: 'connect', path: '/selected/folder \n ' }]);
  } finally { globalThis.fetch = fetchBefore; }
});

test('desktop cancellation and aborted editors never validate or connect a path', async () => {
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async () => { assert.fail('Cancelled selection must not connect a folder'); };
  try {
    const controller = new AbortController();
    assert.deepEqual(await selectNativeFolder(controller.signal, { pickFolder: async () => ({ cancelled: true }), cancelFolderPicker: () => assert.fail() }), { cancelled: true });
    let cancelledId = ''; let selectedId = '';
    const desktop: DesktopFolderPicker = {
      pickFolder: async id => { selectedId = id; controller.abort(); return { path: '/discarded' }; },
      cancelFolderPicker: id => { cancelledId = id; },
    };
    assert.deepEqual(await selectNativeFolder(controller.signal, desktop), { cancelled: true });
    assert.equal(cancelledId, selectedId); assert.notEqual(selectedId, '');
    assert.deepEqual(await selectNativeFolder(controller.signal, { ...desktop, pickFolder: async () => assert.fail('Already aborted') }), { cancelled: true });
  } finally { globalThis.fetch = fetchBefore; }
});

test('a failed desktop picker reports its error and removes editor cancellation handling', async () => {
  const controller = new AbortController(); let cancellations = 0;
  await assert.rejects(selectNativeFolder(controller.signal, {
    pickFolder: async () => { throw new Error('Native failure'); }, cancelFolderPicker: () => { cancellations++; },
  }), /Native failure/);
  controller.abort(); assert.equal(cancellations, 0);
});

test('browser selection never returns a folder after the editor was cancelled', async () => {
  const fetchBefore = globalThis.fetch;
  const controller = new AbortController();
  globalThis.fetch = async () => {
    controller.abort();
    return Response.json({ folder: { path: '/discarded' } });
  };
  try { assert.deepEqual(await selectNativeFolder(controller.signal), { cancelled: true }); }
  finally { globalThis.fetch = fetchBefore; }
});
