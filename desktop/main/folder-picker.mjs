import { isAppUrl } from './security.mjs';

/** @param {{ window: () => import('electron').BrowserWindow | null, origin: () => string | undefined, show: (parent: import('electron').BrowserWindow, options: import('electron').OpenDialogOptions) => Promise<import('electron').OpenDialogReturnValue> }} options */
export function createDesktopFolderPicker({ window, origin, show }) {
  /** @type {{ id: string, sender: number, cancelled: boolean } | undefined} */
  let pending;
  /** @param {import('electron').IpcMainInvokeEvent | import('electron').IpcMainEvent} event */
  const authorized = event => {
    const parent = window(); const localOrigin = origin();
    return parent && !parent.isDestroyed() && localOrigin && event.sender === parent.webContents
      && event.senderFrame === event.sender.mainFrame && isAppUrl(event.senderFrame?.url ?? '', localOrigin) ? parent : null;
  };
  return {
    /** @param {import('electron').IpcMainInvokeEvent} event @param {unknown} id */
    async pick(event, id) {
      const parent = authorized(event);
      if (!parent || typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw new Error('Folder selection requires the Sector 7 window.');
      if (pending) throw new Error('A folder picker is already open. Finish or cancel it before opening another.');
      const request = { id, sender: event.sender.id, cancelled: false };
      pending = request;
      try {
        const result = await show(parent, { title: 'Connect a folder to Sector 7', buttonLabel: 'Connect', properties: ['openDirectory', 'dontAddToRecent'] });
        if (request.cancelled || !authorized(event) || result.canceled || !result.filePaths[0]) return { cancelled: true };
        return { path: result.filePaths[0] };
      } finally { pending = undefined; }
    },
    /**
     * Electron cannot close an open directory sheet programmatically. Discard its result after editor cancellation.
     * @param {import('electron').IpcMainEvent} event
     * @param {unknown} id
     */
    cancel(event, id) {
      if (authorized(event) && pending && pending.id === id && pending.sender === event.sender.id) pending.cancelled = true;
    },
  };
}
