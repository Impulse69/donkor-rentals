import { ipcMain, app } from 'electron';
import { registerCatalogIpc } from './handlers/catalog';
import { registerCustomersIpc } from './handlers/customers';
import { registerBookingsIpc } from './handlers/bookings';
import { registerInvoicesIpc } from './handlers/invoices';
import { registerCompanyIpc } from './handlers/company';
import { registerReturnsIpc } from './handlers/returns';
import { registerDocumentsIpc } from './handlers/documents';
import { registerReportsIpc } from './handlers/reports';
import { registerSettingsIpc } from './handlers/settings';
import { registerBackupIpc } from './handlers/backup';
import { registerAccountingIpc } from './handlers/accounting';
import { registerVendorsIpc } from './handlers/vendors';
import { registerExpensesIpc } from './handlers/expenses';

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
  registerCompanyIpc();
  registerReturnsIpc();
  registerDocumentsIpc();
  registerReportsIpc();
  registerAccountingIpc();
  registerVendorsIpc();
  registerExpensesIpc();
  registerSettingsIpc();
  registerBackupIpc();
}
