import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseClient } from '../supabase/client';

export interface ArchivedDocument {
  id: string;
  tenant_id: string;
  source_type: 'booking' | 'invoice' | 'payment' | 'return';
  source_id: string;
  kind: 'contract' | 'invoice' | 'receipt' | 'trip_sheet';
  title: string;
  storage_path: string | null;
  html: string;
  created_at: string;
}

const DOC_COLS = `id, tenant_id, source_type, source_id, kind, title, storage_path, html, created_at`;

export async function generateContract(db: Database, tenantId: string, bookingId: string): Promise<ArchivedDocument> {
  const booking = readBookingBundle(db, tenantId, bookingId);
  const title = `Contract - ${booking.customer_name}`;
  const html = layoutDocument(title, [
    `<p><strong>Customer:</strong> ${escapeHtml(booking.customer_name)}</p>`,
    `<p><strong>Rental period:</strong> ${escapeHtml(booking.starts_at)} to ${escapeHtml(booking.ends_at)}</p>`,
    `<h2>Rental items</h2>${linesTable(booking.lines)}`,
    `<p class="signature">Customer signature: ______________________________</p>`,
  ]);
  return archiveDocument(db, tenantId, 'booking', bookingId, 'contract', title, html);
}

export async function generateTripSheet(db: Database, tenantId: string, bookingId: string): Promise<ArchivedDocument> {
  const booking = readBookingBundle(db, tenantId, bookingId);
  const title = `Hearse trip sheet - ${booking.customer_name}`;
  const hearseLines = booking.lines.filter((line) => line['item_kind'] === 'hearse');
  const html = layoutDocument(title, [
    `<p><strong>Driver:</strong> ${escapeHtml(booking.driver_name ?? 'Unassigned')}</p>`,
    `<p><strong>Pickup:</strong> ${escapeHtml(booking.pickup_location ?? 'Not set')}</p>`,
    `<p><strong>Drop-off:</strong> ${escapeHtml(booking.dropoff_location ?? 'Not set')}</p>`,
    `<h2>Vehicle log</h2>${linesTable(hearseLines.length > 0 ? hearseLines : booking.lines)}`,
    `<p class="signature">Driver signature: ______________________________</p>`,
  ]);
  return archiveDocument(db, tenantId, 'booking', bookingId, 'trip_sheet', title, html);
}

export async function generateInvoiceDocument(db: Database, tenantId: string, invoiceId: string): Promise<ArchivedDocument> {
  const invoice = readInvoiceBundle(db, tenantId, invoiceId);
  const title = `Invoice ${invoice.number}`;
  const html = layoutDocument(title, [
    `<p><strong>Customer:</strong> ${escapeHtml(invoice.customer_name)}</p>`,
    `<p><strong>Status:</strong> ${escapeHtml(invoice.status)}</p>`,
    `<h2>Invoice lines</h2>${invoiceLinesTable(invoice.lines)}`,
    `<p class="total"><strong>Total:</strong> ${formatPesewas(invoice.total_pesewas)}</p>`,
  ]);
  return archiveDocument(db, tenantId, 'invoice', invoiceId, 'invoice', title, html);
}

export async function generateReceipt(db: Database, tenantId: string, paymentId: string): Promise<ArchivedDocument> {
  const payment = db
    .prepare(
      `SELECT p.id, p.invoice_id, p.kind, p.amount_pesewas, p.method, p.reference, p.paid_at,
              i.number, c.name AS customer_name
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       JOIN bookings b ON b.id = i.booking_id
       JOIN customers c ON c.id = b.customer_id
       WHERE p.id = @id AND p.tenant_id = @tenant_id AND p.deleted_at IS NULL`,
    )
    .get({ id: paymentId, tenant_id: tenantId }) as
    | {
        id: string;
        invoice_id: string;
        kind: string;
        amount_pesewas: number;
        method: string;
        reference: string | null;
        paid_at: string;
        number: string;
        customer_name: string;
      }
    | undefined;
  if (!payment) throw new Error('Payment not found');

  const title = `Receipt - ${payment.number}`;
  const html = layoutDocument(title, [
    `<p><strong>Customer:</strong> ${escapeHtml(payment.customer_name)}</p>`,
    `<p><strong>Payment:</strong> ${escapeHtml(payment.kind)} by ${escapeHtml(payment.method)}</p>`,
    `<p><strong>Reference:</strong> ${escapeHtml(payment.reference ?? 'None')}</p>`,
    `<p class="total"><strong>Amount:</strong> ${formatPesewas(payment.amount_pesewas)}</p>`,
  ]);
  return archiveDocument(db, tenantId, 'payment', paymentId, 'receipt', title, html);
}

export function listDocuments(db: Database, tenantId: string, sourceType: string, sourceId: string): ArchivedDocument[] {
  return db
    .prepare(
      `SELECT ${DOC_COLS} FROM documents
       WHERE tenant_id = @tenant_id AND source_type = @source_type AND source_id = @source_id
       ORDER BY created_at DESC`,
    )
    .all({ tenant_id: tenantId, source_type: sourceType, source_id: sourceId }) as ArchivedDocument[];
}

async function archiveDocument(
  db: Database,
  tenantId: string,
  sourceType: ArchivedDocument['source_type'],
  sourceId: string,
  kind: ArchivedDocument['kind'],
  title: string,
  html: string,
): Promise<ArchivedDocument> {
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  const storagePath = await uploadDocument(`${tenantId}/${kind}/${id}.html`, html);
  db.prepare(
    `INSERT INTO documents (${DOC_COLS})
     VALUES (@id, @tenant_id, @source_type, @source_id, @kind, @title, @storage_path, @html, @created_at)`,
  ).run({
    id,
    tenant_id: tenantId,
    source_type: sourceType,
    source_id: sourceId,
    kind,
    title,
    storage_path: storagePath,
    html,
    created_at: createdAt,
  });
  return db.prepare(`SELECT ${DOC_COLS} FROM documents WHERE id = @id`).get({ id }) as ArchivedDocument;
}

async function uploadDocument(path: string, html: string): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { error } = await client.storage.from('documents').upload(path, new Blob([html], { type: 'text/html' }), {
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return path;
}

function readBookingBundle(db: Database, tenantId: string, bookingId: string) {
  const booking = db
    .prepare(
      `SELECT b.id, b.starts_at, b.ends_at, b.pickup_location, b.dropoff_location, b.driver_name,
              c.name AS customer_name
       FROM bookings b
       JOIN customers c ON c.id = b.customer_id
       WHERE b.id = @id AND b.tenant_id = @tenant_id AND b.deleted_at IS NULL`,
    )
    .get({ id: bookingId, tenant_id: tenantId }) as
    | {
        id: string;
        starts_at: string;
        ends_at: string;
        pickup_location: string | null;
        dropoff_location: string | null;
        driver_name: string | null;
        customer_name: string;
      }
    | undefined;
  if (!booking) throw new Error('Booking not found');
  const lines = db
    .prepare(
      `SELECT bl.quantity, bl.daily_rate_pesewas, bl.odometer_start_km, bl.odometer_end_km,
              bl.fuel_litres_start, bl.fuel_litres_end,
              i.name AS item_name, i.kind AS item_kind,
              u.identifier AS unit_identifier, u.plate
       FROM booking_lines bl
       JOIN items i ON i.id = bl.item_id
       LEFT JOIN item_units u ON u.id = bl.item_unit_id
       WHERE bl.booking_id = @id AND bl.tenant_id = @tenant_id AND bl.deleted_at IS NULL`,
    )
    .all({ id: bookingId, tenant_id: tenantId }) as Array<Record<string, unknown>>;
  return { ...booking, lines };
}

function readInvoiceBundle(db: Database, tenantId: string, invoiceId: string) {
  const invoice = db
    .prepare(
      `SELECT i.id, i.number, i.status, i.total_pesewas, c.name AS customer_name
       FROM invoices i
       JOIN bookings b ON b.id = i.booking_id
       JOIN customers c ON c.id = b.customer_id
       WHERE i.id = @id AND i.tenant_id = @tenant_id AND i.deleted_at IS NULL`,
    )
    .get({ id: invoiceId, tenant_id: tenantId }) as
    | { id: string; number: string; status: string; total_pesewas: number; customer_name: string }
    | undefined;
  if (!invoice) throw new Error('Invoice not found');
  const lines = db
    .prepare(
      `SELECT description, quantity, days, unit_price_pesewas, line_total_pesewas
       FROM invoice_lines
       WHERE invoice_id = @id AND tenant_id = @tenant_id AND deleted_at IS NULL
       ORDER BY sort_order ASC`,
    )
    .all({ id: invoiceId, tenant_id: tenantId }) as Array<Record<string, unknown>>;
  return { ...invoice, lines };
}

function layoutDocument(title: string, sections: string[]): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Georgia, serif; color: #241b15; margin: 42px; }
    header { border-bottom: 2px solid #b8892f; margin-bottom: 24px; padding-bottom: 12px; }
    h1 { margin: 0; font-size: 30px; }
    h2 { margin-top: 26px; font-size: 18px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border-bottom: 1px solid #ddd2bd; padding: 8px; text-align: left; }
    th { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #725f4a; }
    .total, .signature { margin-top: 28px; font-size: 18px; }
  </style>
</head>
<body>
  <header><h1>Donkor &amp; Sons</h1><div>${escapeHtml(title)}</div></header>
  ${sections.join('\n')}
</body>
</html>`;
}

function linesTable(lines: Array<Record<string, unknown>>): string {
  return `<table><thead><tr><th>Item</th><th>Unit</th><th>Qty</th><th>Rate</th><th>Odometer</th><th>Fuel</th></tr></thead><tbody>${lines
    .map(
      (line) =>
        `<tr><td>${escapeHtml(String(line['item_name'] ?? 'Item'))}</td><td>${escapeHtml(String(line['unit_identifier'] ?? line['plate'] ?? 'Pool'))}</td><td>${line['quantity']}</td><td>${formatPesewas(Number(line['daily_rate_pesewas'] ?? 0))}</td><td>${escapeHtml(String(line['odometer_start_km'] ?? '-'))} / ${escapeHtml(String(line['odometer_end_km'] ?? '-'))}</td><td>${escapeHtml(String(line['fuel_litres_start'] ?? '-'))} / ${escapeHtml(String(line['fuel_litres_end'] ?? '-'))}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

function invoiceLinesTable(lines: Array<Record<string, unknown>>): string {
  return `<table><thead><tr><th>Description</th><th>Qty</th><th>Days</th><th>Unit</th><th>Total</th></tr></thead><tbody>${lines
    .map(
      (line) =>
        `<tr><td>${escapeHtml(String(line['description'] ?? 'Line'))}</td><td>${line['quantity']}</td><td>${line['days']}</td><td>${formatPesewas(Number(line['unit_price_pesewas'] ?? 0))}</td><td>${formatPesewas(Number(line['line_total_pesewas'] ?? 0))}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

function formatPesewas(amount: number): string {
  return `GHS ${(amount / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
