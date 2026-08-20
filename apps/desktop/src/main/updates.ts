import type { Database } from 'better-sqlite3';
import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log/main';
import { resolveUpdatePolicy } from '@shared/updates';
import { getAppSettings, updateAppSettings, type AppSettings } from './repositories/settings';

export interface UpdateStatus {
  channel: AppSettings['update_channel'];
  allowPrerelease: boolean;
  checking: boolean;
  lastCheckAt: string | null;
  lastMessage: string | null;
  downloadPercent: number | null;
  downloadedVersion: string | null;
}

let checking = false;
let lastCheckAt: string | null = null;
let lastMessage: string | null = null;
let downloadPercent: number | null = null;
let downloadedVersion: string | null = null;
let updateTimer: NodeJS.Timeout | null = null;

export function configureUpdates(db: Database): void {
  autoUpdater.logger = log;
  applyUpdateSettings(getAppSettings(db));

  autoUpdater.on('checking-for-update', () => {
    checking = true;
    downloadPercent = null;
    lastMessage = 'Checking for updates';
  });
  autoUpdater.on('update-available', (info) => {
    checking = true;
    downloadPercent = 0;
    lastMessage = `Update available: ${info.version}`;
  });
  autoUpdater.on('download-progress', (progress) => {
    checking = true;
    downloadPercent = Math.max(0, Math.min(100, progress.percent));
    lastMessage = `Downloading update: ${Math.round(downloadPercent)}%`;
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('update-progress', downloadPercent);
    }
  });
  autoUpdater.on('update-not-available', () => {
    checking = false;
    lastMessage = 'No update available';
  });
  autoUpdater.on('error', (error) => {
    checking = false;
    lastMessage = error.message;
  });
  autoUpdater.on('update-downloaded', (info) => {
    checking = false;
    downloadPercent = 100;
    downloadedVersion = info.version;
    lastMessage = `Update downloaded: ${info.version}`;
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('update-downloaded', info.version);
    }
  });

  updateTimer = setInterval(() => {
    void checkForUpdates(db).catch((err) => log.warn('scheduled update check failed', err));
  }, 6 * 60 * 60 * 1000);
}

export function stopUpdates(): void {
  if (updateTimer) clearInterval(updateTimer);
  updateTimer = null;
}

export async function checkForUpdates(db: Database): Promise<UpdateStatus> {
  applyUpdateSettings(getAppSettings(db));
  lastCheckAt = new Date().toISOString();
  if (!app.isPackaged) {
    lastMessage = 'Update checks run in packaged builds';
    return getUpdateStatus(db);
  }
  checking = true;
  await autoUpdater.checkForUpdates();
  return getUpdateStatus(db);
}

export function getUpdateStatus(db: Database): UpdateStatus {
  const settings = getAppSettings(db);
  const policy = resolveUpdatePolicy(settings.update_channel);
  return {
    channel: policy.channel,
    allowPrerelease: policy.allowPrerelease,
    checking,
    lastCheckAt,
    lastMessage,
    downloadPercent,
    downloadedVersion,
  };
}

export function setUpdateChannel(db: Database, channel: AppSettings['update_channel']): UpdateStatus {
  const settings = updateAppSettings(db, { update_channel: channel });
  applyUpdateSettings(settings);
  return getUpdateStatus(db);
}

function applyUpdateSettings(settings: AppSettings): void {
  const policy = resolveUpdatePolicy(settings.update_channel);
  autoUpdater.channel = policy.channel;
  autoUpdater.allowPrerelease = policy.allowPrerelease;
  autoUpdater.autoDownload = true;
}

export function restartAndInstall(): void {
  /*
   * (isSilent, isForceRunAfter). Without isSilent the assisted NSIS installer
   * runs interactively, so every "Restart & install" replayed the full setup
   * wizard — choose all-users-or-just-me, choose the folder — questions the
   * person already answered when they first installed. Silent mode runs the
   * installer with /S, which reuses the install mode and directory recorded at
   * first install, and force-run brings the app straight back up after.
   *
   * A fresh install from the downloaded .exe still shows the wizard, which is
   * the one time those questions are worth asking.
   */
  autoUpdater.quitAndInstall(true, true);
}
