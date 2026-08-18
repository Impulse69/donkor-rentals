import { ipcMain } from 'electron';
import { z } from 'zod';
import {
  InvoiceCreateFromBooking,
  InvoiceUpdateInput,
  InvoiceFilter,
  PaymentCreateInput,
  Uuid,
} from '@shared/schemas';
import { wrap } from '../envelope';
import { getDb, ensureBootstrapTenant } from '../../db';
import * as invoices from '../../repositories/invoices';

function tenant(): string {
  return ensureBootstrapTenant(getDb());
}

export function registerInvoicesIpc(): void {
  ipcMain.handle(
    'invoices:list',
    wrap('invoices:list', InvoiceFilter.optional().default({}), (filter) =>
      invoices.listInvoices(getDb(), tenant(), filter ?? {}),
    ),
  );

  ipcMain.handle(
    'invoices:get',
    wrap('invoices:get', z.object({ id: Uuid }), ({ id }) =>
      invoices.getInvoice(getDb(), tenant(), id),
    ),
  );

  ipcMain.handle(
    'invoices:createFromBooking',
    wrap('invoices:createFromBooking', InvoiceCreateFromBooking, (input) =>
      invoices.createInvoiceFromBooking(getDb(), tenant(), input),
    ),
  );

  ipcMain.handle(
    'invoices:update',
    wrap(
      'invoices:update',
      z.object({ id: Uuid, patch: InvoiceUpdateInput }),
      ({ id, patch }) => invoices.updateInvoice(getDb(), tenant(), id, patch),
    ),
  );

  ipcMain.handle(
    'invoices:softDelete',
    wrap('invoices:softDelete', z.object({ id: Uuid }), ({ id }) => {
      invoices.softDeleteInvoice(getDb(), tenant(), id);
      return { id };
    }),
  );

  ipcMain.handle(
    'payments:record',
    wrap('payments:record', PaymentCreateInput, (input) =>
      invoices.recordPayment(getDb(), tenant(), input),
    ),
  );

  ipcMain.handle(
    'payments:void',
    wrap('payments:void', z.object({ id: Uuid }), ({ id }) =>
      invoices.voidPayment(getDb(), tenant(), id),
    ),
  );
}
