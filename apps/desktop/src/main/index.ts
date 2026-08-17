import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import log from 'electron-log/main';
import { registerIpc } from './ipc';
import { openDb, closeDb, getDb } from './db';
import { seedIfEmpty } from './db/seed';
import { hasCompanyProfile } from './repositories/company';
import { configureUpdates, stopUpdates } from './updates';
import { captureCrash, configureCrashReporting } from './crash';

log.initialize();
log.transports.file.level = 'info';
log.info('Donkor Rentals — main process starting');

const isDev = !app.isPackaged;

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#FAF6EE',
    title: 'Donkor & Sons — Rentals',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.on('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

app.whenReady().then(() => {
  try {
    openDb();
    if (!app.isPackaged && hasCompanyProfile(getDb())) seedIfEmpty(getDb());
  } catch (err) {
    log.error('failed to open database', err);
    app.exit(1);
    return;
  }
  registerIpc();
  configureCrashReporting(getDb());
  configureUpdates(getDb());
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  stopUpdates();
  closeDb();
});

process.on('uncaughtException', (err) => {
  captureCrash(err);
  log.error('uncaught exception', err);
});

process.on('unhandledRejection', (err) => {
  captureCrash(err);
  log.error('unhandled rejection', err);
});
