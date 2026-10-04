import { app, BrowserWindow, dialog, ipcMain, Menu, powerSaveBlocker, shell } from 'electron';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';
import { externalUrl, isAppUrl, protectSession } from './security.mjs';
import { logger, startBackend, stopBackend } from './server.mjs';
import { createDesktopFolderPicker } from './folder-picker.mjs';

app.setName('Sector 7');
app.setPath('userData', join(app.getPath('appData'), 'Sector 7'));
app.setAppLogsPath(join(homedir(), 'Library', 'Logs', 'Sector 7'));
app.enableSandbox();
const desktop = dirname(dirname(fileURLToPath(import.meta.url)));
/** @type {BrowserWindow | null} */ let window = null;
/** @type {Awaited<ReturnType<typeof startBackend>> | undefined} */ let backend;
/** @type {ReturnType<typeof loadConfig> extends Promise<infer T> ? T : never} */ let config;
let closing = false;
let quitting = false;
let exiting = false;
let startup = true;
let closeReady = false;
/** @type {{id: string, sender: number, resolve: (error: string | null) => void} | undefined} */ let closeRequest;
const log = logger(join(app.getPath('logs'), 'main.log'));
const folderPicker = createDesktopFolderPicker({ window: () => window, origin: () => backend?.origin, show: (parent, options) => dialog.showOpenDialog(parent, options) });
ipcMain.handle('sector7:pick-folder', (event, id) => folderPicker.pick(event, id));
ipcMain.on('sector7:cancel-folder-picker', (event, id) => folderPicker.cancel(event, id));

ipcMain.on('sector7:close-ready', event => {
  if (window && event.sender === window.webContents && backend && isAppUrl(event.senderFrame?.url ?? '', backend.origin)) closeReady = true;
});
ipcMain.on('sector7:close-result', (event, id, error) => {
  if (closeRequest && id === closeRequest.id && event.sender.id === closeRequest.sender && event.senderFrame === event.sender.mainFrame) {
    closeRequest.resolve(error === null ? null : 'Changes could not be saved. Keep the app open to recover or retry.');
  }
});

/** @param {string} url */
function openExternal(url) {
  const target = externalUrl(url);
  if (target) void shell.openExternal(target).catch(() => log('External link could not open.\n'));
}

function createWindow() {
  if (!backend || window) return;
  closeReady = false;
  const current = new BrowserWindow({
    width: 1280, height: 900, minWidth: 720, minHeight: 600, title: 'Sector 7', backgroundColor: '#0b0c18',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, preload: join(desktop, 'main', 'preload.cjs') },
  });
  window = current;
  protectSession(current.webContents.session, backend.origin, backend.token);
  current.webContents.on('will-navigate', (event, url) => {
    if (!backend || !isAppUrl(url, backend.origin)) { event.preventDefault(); openExternal(url); }
  });
  current.webContents.on('will-redirect', (event, url) => { if (!backend || !isAppUrl(url, backend.origin)) event.preventDefault(); });
  current.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  current.webContents.on('will-attach-webview', event => event.preventDefault());
  current.webContents.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace) closeReady = false; });
  current.on('close', event => {
    if (exiting) return;
    event.preventDefault();
    if (!closing) void closeWindow(quitting);
  });
  current.on('closed', () => { window = null; closeReady = false; });
  void current.loadURL(backend.origin).catch(() => {
    dialog.showErrorBox('Sector 7 could not load', 'Open Help > Open Logs Folder for details, then restart the app.');
  });
}

/** @param {boolean} quit */
async function closeWindow(quit) {
  if (closing) return;
  closing = true;
  const current = window;
  let error = null;
  if (current && !current.isDestroyed() && closeReady) {
    error = await new Promise(resolve => {
      const id = randomUUID();
      const timeout = setTimeout(() => { closeRequest = undefined; resolve('The workspace is still busy. Keep the app open to finish saving.'); }, 15000);
      closeRequest = { id, sender: current.webContents.id, resolve: result => { clearTimeout(timeout); closeRequest = undefined; resolve(result); } };
      current.webContents.send('sector7:prepare-close', id);
    });
  } else if (current && backend) error = 'The workspace has not finished loading. Closing now may discard unsaved changes.';
  if (error && current && !current.isDestroyed()) {
    const choice = await dialog.showMessageBox(current, { type: 'warning', title: 'Workspace not saved', message: error,
      buttons: ['Keep open', 'Close without saving'], defaultId: 0, cancelId: 0 });
    if (choice.response === 0) { closing = false; quitting = false; return; }
  }
  current?.destroy();
  closing = false;
  if (quit || quitting) await quitApp();
}

async function quitApp() {
  if (exiting) return;
  exiting = true;
  if (backend) await stopBackend(backend);
  app.exit(0);
}

app.on('before-quit', event => {
  if (exiting) return;
  event.preventDefault(); quitting = true;
  if (startup) return;
  if (window) void closeWindow(true); else void quitApp();
});
app.on('window-all-closed', () => { /* Mac Dock keeps the backend alive until Quit. */ });
app.on('activate', () => { if (!startup && !quitting) createWindow(); });
app.on('second-instance', () => { if (!window) createWindow(); if (window?.isMinimized()) window.restore(); window?.focus(); });

if (!app.requestSingleInstanceLock()) app.exit(0);
else void app.whenReady().then(async () => {
  try {
    config = await loadConfig(app.getPath('userData'));
    app.setAboutPanelOptions({ applicationName: 'Sector 7', applicationVersion: app.getVersion(), copyright: 'Based on big-AGI. MIT license.' });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Sector 7', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
      { role: 'editMenu' },
      { label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
      { role: 'windowMenu' },
      { role: 'help', submenu: [
        { label: 'Open Logs Folder', click: () => { void shell.openPath(app.getPath('logs')); } },
        { label: 'Open Data Folder', click: () => { void shell.openPath(config.dataDir ?? join(homedir(), 'Library', 'Application Support', 'AI GUI')); } },
        { label: 'Open Configuration', click: () => { void shell.openPath(join(app.getPath('userData'), 'config.json')); } },
      ] },
    ]));
    const resources = app.isPackaged ? process.resourcesPath : process.env.SECTOR7_DESKTOP_STAGE || join(desktop, '.stage');
    backend = await startBackend(config, join(resources, 'server'), app.getPath('logs'));
    startup = false;
    if (quitting) { await quitApp(); return; }
    if (config.preventSleep) powerSaveBlocker.start('prevent-app-suspension');
    backend.child.once('exit', () => {
      if (!exiting) { dialog.showErrorBox('Sector 7 server stopped', 'The local backend exited. Saved data remains on disk. Restart the app; logs are in ~/Library/Logs/Sector 7.'); void quitApp(); }
    });
    createWindow();
  } catch (error) {
    startup = false;
    const message = error instanceof Error ? error.message : 'Startup failed.';
    log(`[${new Date().toISOString()}] ${message}\n`);
    await dialog.showMessageBox({ type: 'error', title: 'Sector 7 could not start', message, buttons: ['Quit', 'Open Logs'], defaultId: 0, cancelId: 0 }).then(choice => { if (choice.response === 1) void shell.openPath(app.getPath('logs')); });
    await quitApp();
  }
});
