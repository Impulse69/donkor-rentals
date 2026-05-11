import { ipcMain } from 'electron';
import { z } from 'zod';
import { Uuid } from '@shared/schemas';
import { wrap } from '../envelope';
import { getDb, ensureBootstrapTenant } from '../../db';
import * as documents from '../../repositories/documents';

function tenant(): string {
  return ensureBootstrapTenant(getDb());
}

export function registerDocumentsIpc(): void {
  ipcMain.handle(
    'documents:contract',
    wrap('documents:contract', z.object({ bookingId: Uuid }), ({ bookingId }) =>
      documents.generateContract(getDb(), tenant(), bookingId),
    ),
  );

  ipcMain.handle(
    'documents:tripSheet',
    wrap('documents:tripSheet', z.object({ bookingId: Uuid }), ({ bookingId }) =>
      documents.generateTripSheet(getDb(), tenant(), bookingId),
    ),
  );

  ipcMain.handle(
    'documents:invoice',
    wrap('documents:invoice', z.object({ invoiceId: Uuid }), ({ invoiceId }) =>
      documents.generateInvoiceDocument(getDb(), tenant(), invoiceId),
    ),
  );

  ipcMain.handle(
    'documents:receipt',
    wrap('documents:receipt', z.object({ paymentId: Uuid }), ({ paymentId }) =>
      documents.generateReceipt(getDb(), tenant(), paymentId),
    ),
  );

  ipcMain.handle(
    'documents:list',
    wrap(
      'documents:list',
      z.object({
        sourceType: z.enum(['booking', 'invoice', 'payment', 'return']),
        sourceId: Uuid,
      }),
      ({ sourceType, sourceId }) => documents.listDocuments(getDb(), tenant(), sourceType, sourceId),
    ),
  );
}
