import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDesktopFolderPicker } from './folder-picker.mjs';

function fixture() {
  const mainFrame = { url: 'http://127.0.0.1:47100/' };
  const sender = { id: 1, mainFrame };
  const parent = { isDestroyed: () => false, webContents: sender };
  const event = { sender, senderFrame: mainFrame };
  const id = '12345678-1234-1234-1234-123456789abc';
  return { parent, event, id };
}

test('desktop dialog is attached to the app window and returns only the chosen directory', async () => {
  const { parent, event, id } = fixture();
  const picker = createDesktopFolderPicker({ window: () => parent, origin: () => 'http://127.0.0.1:47100', show: async (owner, options) => {
    assert.equal(owner, parent); assert.deepEqual(options.properties, ['openDirectory', 'dontAddToRecent']);
    return { canceled: false, filePaths: ['/folder \n '] };
  } });
  assert.deepEqual(await picker.pick(event, id), { path: '/folder \n ' });
});

test('other senders, subframes and remote pages cannot open or cancel the picker', async () => {
  const { parent, event, id } = fixture();
  const picker = createDesktopFolderPicker({ window: () => parent, origin: () => 'http://127.0.0.1:47100', show: async () => assert.fail('Unauthorized picker') });
  await assert.rejects(picker.pick({ ...event, sender: { ...event.sender, id: 2 } }, id), /requires/);
  await assert.rejects(picker.pick({ ...event, senderFrame: { url: event.senderFrame.url } }, id), /requires/);
  event.senderFrame.url = 'https://example.com/';
  await assert.rejects(picker.pick(event, id), /requires/);
});

test('duplicate opens are gated until the sheet closes and cancelled editors discard selection', async () => {
  const { parent, event, id } = fixture();
  let finish;
  const picker = createDesktopFolderPicker({ window: () => parent, origin: () => 'http://127.0.0.1:47100', show: () => new Promise(resolve => { finish = resolve; }) });
  const pending = picker.pick(event, id);
  await assert.rejects(picker.pick(event, id), /already open/);
  picker.cancel({ ...event, sender: { ...event.sender, id: 2 } }, id);
  picker.cancel(event, 'different-request');
  picker.cancel(event, id);
  await assert.rejects(picker.pick(event, id), /already open/);
  finish({ canceled: false, filePaths: ['/discarded'] });
  assert.deepEqual(await pending, { cancelled: true });
  const next = picker.pick(event, id); finish({ canceled: true, filePaths: [] });
  assert.deepEqual(await next, { cancelled: true });
});

test('native failures release the gate and a page navigation discards its selected path', async () => {
  const { parent, event, id } = fixture(); let calls = 0;
  const picker = createDesktopFolderPicker({ window: () => parent, origin: () => 'http://127.0.0.1:47100', show: async () => {
    if (!calls++) throw new Error('Native failure');
    event.senderFrame.url = 'https://example.com/'; return { canceled: false, filePaths: ['/discarded'] };
  } });
  await assert.rejects(picker.pick(event, id), /Native failure/);
  assert.deepEqual(await picker.pick(event, id), { cancelled: true });
});
