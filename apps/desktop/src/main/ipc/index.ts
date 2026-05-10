import { ipcMain, app } from 'electron';
import { registerCatalogIpc } from './handlers/catalog';
import { registerCustomersIpc } from './handlers/customers';
import { registerBookingsIpc } from './handlers/bookings';
import { registerInvoicesIpc } from './handlers/invoices';

/**
 * IPC handler registration. The renderer reaches main only via these channels.
 * Every handler is wrapped in `envelope.wrap` and returns `Result<T>`.
 */
export function registerIpc(): void {
  ipcMain.handle('ping', () => 'pong');
  ipcMain.handle('app:getVersion', () => app.getVersion());
  registerCatalogIpc();
  registerCustomersIpc();
  registerBookingsIpc();
  registerInvoicesIpc();
}
