import { ipcMain } from 'electron';
import { app } from 'electron';

/**
 * IPC handler registration. The renderer reaches main only via these channels.
 * Phase 0: ping + app:getVersion. Real domain handlers (catalog, customers, ...)
 * are added in Phase 1+.
 */
export function registerIpc(): void {
  ipcMain.handle('ping', () => 'pong');
  ipcMain.handle('app:getVersion', () => app.getVersion());
}
