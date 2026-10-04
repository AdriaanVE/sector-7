const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('sector7Desktop', {
  /** @param {() => Promise<void>} callback */
  onPrepareClose(callback) {
    const handler = async (/** @type {import('electron').IpcRendererEvent} */ _event, /** @type {string} */ id) => {
      try { await callback(); ipcRenderer.send('sector7:close-result', id, null); }
      catch { ipcRenderer.send('sector7:close-result', id, 'Changes could not be saved. Keep the app open to recover or retry.'); }
    };
    ipcRenderer.on('sector7:prepare-close', handler);
    ipcRenderer.send('sector7:close-ready');
    return () => ipcRenderer.removeListener('sector7:prepare-close', handler);
  },
});
