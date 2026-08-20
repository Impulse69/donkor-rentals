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

// Test hook: point userData somewhere else so two app instances can stand in
// for two different machines (e.g. proving a backup made on one restores on
// another). Must run before app.whenReady, since the database path derives from
// userData. Ignored when the variable is unset, so real installs never see it.
if (process.env['DONKOR_USERDATA_OVERRIDE']) {
  app.setPath('userData', process.env['DONKOR_USERDATA_OVERRIDE']);
}

/** Page zoom applied on launch; Ctrl/Cmd +, - and 0 adjust and reset it. */
const DEFAULT_ZOOM = 0.8;
const ZOOM_STEP = 0.05;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 1.4;

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    // Matches --paper in the QBO token set. This was still the pre-redesign
    // cream, which flashed before the renderer painted.
    backgroundColor: '#F4F5F8',
    title: 'Donkor & Sons — Rentals',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // The interface reads a little large at 100% on a typical shop monitor.
      // Zooming the whole page keeps the design system's proportions intact —
      // type scale, spacing and hairlines all shrink together — where trimming
      // individual tokens would distort them relative to each other.
      zoomFactor: DEFAULT_ZOOM,
    },
  });

  win.on('ready-to-show', () => win.show());

  // "A bit smaller" is a matter of taste and eyesight, so give the operator the
  // usual desktop controls rather than making them live with one guess.
  win.webContents.on('before-input-event', (event, input) => {
    if (!input.control && !input.meta) return;
    const current = win.webContents.getZoomFactor();
    if (input.key === '=' || input.key === '+') {
      win.webContents.setZoomFactor(Math.min(current + ZOOM_STEP, MAX_ZOOM));
      event.preventDefault();
    } else if (input.key === '-') {
      win.webContents.setZoomFactor(Math.max(current - ZOOM_STEP, MIN_ZOOM));
      event.preventDefault();
    } else if (input.key === '0') {
      win.webContents.setZoomFactor(DEFAULT_ZOOM);
      event.preventDefault();
    }
  });

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
