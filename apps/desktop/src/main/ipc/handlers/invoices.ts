import { ipcMain } from 'electron';
import { z } from 'zod';
import {
  InvoiceCreateFromBooking,
  InvoiceUpdateInput,
  InvoiceFilter,
  IsoDateTime,
  PaymentCreateInput,
  PaymentMethod,
  Pesewas,
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

  // The counter path: quote a booking, then take the money against it. Both
  // sit here rather than under payments because both are really about the
  // invoice the walk-in never has to see.
  ipcMain.handle(
    'invoices:previewForBooking',
    wrap(
      'invoices:previewForBooking',
      z.object({ bookingId: Uuid, includeStatutory: z.boolean().optional() }),
      ({ bookingId, includeStatutory }) =>
        invoices.previewInvoiceForBooking(getDb(), tenant(), bookingId, includeStatutory ?? true),
    ),
  );

  ipcMain.handle(
    'invoices:takePayment',
    wrap(
      'invoices:takePayment',
      z.object({
        booking_id: Uuid,
        amount_pesewas: Pesewas.refine((n) => n > 0, 'Amount must be more than zero'),
        method: PaymentMethod,
        paid_at: IsoDateTime,
        include_statutory_taxes: z.boolean().optional(),
        reference: z.string().max(200).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
      }),
      (input) => invoices.takePaymentForBooking(getDb(), tenant(), input),
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
