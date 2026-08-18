import { ipcMain } from 'electron';
import { z } from 'zod';
import { wrap } from '../envelope';
import { chooseAndCreateBackup, chooseAndRestoreBackup, listRecentBackups } from '../../backup';

export function registerBackupIpc(): void {
  ipcMain.handle(
    'backup:create',
    wrap('backup:create', z.void().optional(), () => chooseAndCreateBackup()),
  );
  ipcMain.handle(
    'backup:restore',
    wrap('backup:restore', z.void().optional(), () => chooseAndRestoreBackup()),
  );
  ipcMain.handle(
    'backup:listRecent',
    wrap('backup:listRecent', z.void().optional(), () => listRecentBackups()),
  );
}
