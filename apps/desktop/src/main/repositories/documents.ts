import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseClient } from '../supabase/client';
import { LOGO_DATA_URI } from '../assets/logoDataUri';

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
  
  const tableRows = booking.lines.map((l) => {
    const itemAndUnit = l.unit_identifier
      ? `${String(l.item_name)} · ${String(l.unit_identifier)}${l.plate ? ` (${String(l.plate)})` : ''}`
      : String(l.item_name);
    return [
      itemAndUnit,
      String(l.quantity),
      `GHS ${(Number(l.daily_rate_pesewas) / 100).toFixed(2)}`,
      `GHS ${(Number(l.daily_rate_pesewas) * Number(l.quantity) / 100).toFixed(2)}`
    ];
  });

  const starts = new Date(booking.starts_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const ends = new Date(booking.ends_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const html = renderHtmlDocument({
    docType: 'CONTRACT',
    docNumber: booking.id.slice(0, 8).toUpperCase(),
    docDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    customerName: booking.customer_name,
    customerPhone: booking.customer_phone,
    customerEmail: booking.customer_email,
    additionalInfo: [
      { label: 'Starts', value: starts },
      { label: 'Ends', value: ends }
    ],
    tableHeaders: ['Item & Unit', 'Qty', 'Rate / Day', 'Total / Day'],
    tableRows,
    totalPesewas: booking.lines.reduce((sum, l) => sum + Number(l.daily_rate_pesewas) * Number(l.quantity), 0),
    notes: booking.notes
  });

  return archiveDocument(db, tenantId, 'booking', bookingId, 'contract', title, html);
}

export async function generateTripSheet(db: Database, tenantId: string, bookingId: string): Promise<ArchivedDocument> {
  const booking = readBookingBundle(db, tenantId, bookingId);
  const title = `Hearse trip sheet - ${booking.customer_name}`;
  const hearseLines = booking.lines.filter((line) => line['item_kind'] === 'hearse');
  const activeLines = hearseLines.length > 0 ? hearseLines : booking.lines;

  const tableRows = activeLines.map((l) => [
    String(l.item_name),
    l.unit_identifier ? String(l.unit_identifier) : 'Pool',
    l.plate ? String(l.plate) : 'N/A',
    String(l.odometer_start_km ?? '-'),
    String(l.fuel_litres_start ?? '-')
  ]);

  const html = renderHtmlDocument({
    docType: 'TRIP SHEET',
    docNumber: booking.id.slice(0, 8).toUpperCase(),
    docDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    customerName: booking.customer_name,
    customerPhone: booking.customer_phone,
    customerEmail: booking.customer_email,
    additionalInfo: [
      { label: 'Driver', value: booking.driver_name ?? 'Unassigned' },
      { label: 'Pickup', value: booking.pickup_location ?? 'Not set' },
      { label: 'Drop-off', value: booking.dropoff_location ?? 'Not set' }
    ],
    tableHeaders: ['Vehicle', 'Unit', 'Plate', 'Odometer Start', 'Fuel Start'],
    tableRows,
    totalPesewas: 0,
    notes: booking.notes
  });

  return archiveDocument(db, tenantId, 'booking', bookingId, 'trip_sheet', title, html);
}

export async function generateInvoiceDocument(
  db: Database,
  tenantId: string,
  invoiceId: string,
  options?: { overrideStatutory?: boolean },
): Promise<ArchivedDocument> {
  const invoice = readInvoiceBundle(db, tenantId, invoiceId);
  const effective = options && typeof options.overrideStatutory === 'boolean'
    ? applyStatutoryOverride(invoice, options.overrideStatutory)
    : invoice;
  const title = `Invoice ${effective.number}`;
  const html = renderInvoiceHtml(effective);
  return archiveDocument(db, tenantId, 'invoice', invoiceId, 'invoice', title, html);
}

/**
 * Apply a print-time format override without mutating the stored invoice.
 *
 * - Toggling ON (`true`): recompute NHIL/GETFund/VAT from the subtotal via the
 *   cascading Ghana formula and add them to the total.
 * - Toggling OFF (`false`): zero the breakdown and rebase the total on the
 *   subtotal alone.
 *
 * Discount always subtracts last in both branches.
 */
export function applyStatutoryOverride(
  invoice: InvoiceTemplateData,
  includeStatutory: boolean,
): InvoiceTemplateData {
  if (invoice.include_statutory_taxes === includeStatutory) return invoice;
  const subtotal = invoice.subtotal_pesewas;
  const discount = invoice.discount_pesewas;
  if (includeStatutory) {
    const nhil = Math.round(subtotal * 0.025);
    const getfund = Math.round(subtotal * 0.025);
    const vat = Math.round((subtotal + nhil + getfund) * 0.15);
    const total = Math.max(0, subtotal + nhil + getfund + vat - discount);
    return {
      ...invoice,
      include_statutory_taxes: true,
      nhil_pesewas: nhil,
      getfund_pesewas: getfund,
      vat_pesewas: vat,
      total_pesewas: total,
    };
  }
  return {
    ...invoice,
    include_statutory_taxes: false,
    nhil_pesewas: 0,
    getfund_pesewas: 0,
    vat_pesewas: 0,
    total_pesewas: Math.max(0, subtotal - discount),
  };
}

export interface InvoiceTemplateData {
  number: string;
  status: string;
  issued_at: string | null;
  due_at: string | null;
  notes: string | null;
  customer_name: string;
  subtotal_pesewas: number;
  discount_pesewas: number;
  total_pesewas: number;
  include_statutory_taxes: boolean;
  nhil_pesewas: number;
  getfund_pesewas: number;
  vat_pesewas: number;
  initial_payment_percent: number;
  before_delivery_percent: number;
  lines: Array<{
    description: string;
    quantity: number;
    unit_price_pesewas: number;
    line_total_pesewas: number;
  }>;
}

/**
 * Customer-mandated invoice template. Two formats: Statutory (Ghana NHIL/GETFund/VAT)
 * and Simple (subtotal only). Layout matches the two PDF samples supplied by the customer.
 */
export function renderInvoiceHtml(invoice: InvoiceTemplateData): string {
  const escape = escapeHtml;
  const fmtMoney = (p: number): string => (p / 100).toFixed(2);
  const fmtDate = (iso: string | null | undefined): string =>
    iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const issuedDate = fmtDate(invoice.issued_at ?? new Date().toISOString());
  const dueDate = fmtDate(invoice.due_at);

  const rowsHtml = invoice.lines.map((l, idx) => {
    const lines = String(l.description).split('\n').map((s) => s.trim()).filter(Boolean);
    const primary = lines[0] ?? '';
    const specs = lines.slice(1).join(', ');
    return `
      <tr>
        <td class="num">${idx + 1}</td>
        <td class="desc">${escape(primary)}</td>
        <td class="specs">${escape(specs)}</td>
        <td class="num">${l.quantity}</td>
        <td class="num">GHC ${fmtMoney(l.unit_price_pesewas)}</td>
        <td class="num">GHC ${fmtMoney(l.line_total_pesewas * 1)}</td>
      </tr>`;
  }).join('');

  const statutoryRows = invoice.include_statutory_taxes
    ? `
      <tr><td class="lbl">Total</td><td class="amt">GHC ${fmtMoney(invoice.subtotal_pesewas)}</td></tr>
      <tr><td class="lbl">NHIL (2.5%)</td><td class="amt">GHC ${fmtMoney(invoice.nhil_pesewas)}</td></tr>
      <tr><td class="lbl">GETFund (2.5%)</td><td class="amt">GHC ${fmtMoney(invoice.getfund_pesewas)}</td></tr>
      <tr><td class="lbl">VAT (15%)</td><td class="amt">GHC ${fmtMoney(invoice.vat_pesewas)}</td></tr>
      ${invoice.discount_pesewas > 0 ? `<tr><td class="lbl">Discount</td><td class="amt">− GHC ${fmtMoney(invoice.discount_pesewas)}</td></tr>` : ''}
      <tr class="grand"><td class="lbl">Total Amount</td><td class="amt">GHC ${fmtMoney(invoice.total_pesewas)}</td></tr>
    `
    : `
      <tr><td class="lbl">Total</td><td class="amt">GHC ${fmtMoney(invoice.subtotal_pesewas)}</td></tr>
      ${invoice.discount_pesewas > 0 ? `<tr><td class="lbl">Discount</td><td class="amt">− GHC ${fmtMoney(invoice.discount_pesewas)}</td></tr>` : ''}
      <tr class="grand"><td class="lbl">Total Amount</td><td class="amt">GHC ${fmtMoney(invoice.total_pesewas)}</td></tr>
    `;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice ${escape(invoice.number)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #1f2937;
      margin: 0;
      padding: 32px 36px;
      line-height: 1.45;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet { max-width: 820px; margin: 0 auto; }
    .letterhead {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 24px;
      padding-bottom: 14px;
      border-bottom: 2px solid #B8860B;
      margin-bottom: 4px;
      position: relative;
    }
    .letterhead::after {
      content: '';
      position: absolute;
      left: 0; right: 0; bottom: -5px;
      height: 1px;
      background: #B8860B;
      opacity: 0.55;
    }
    .letterhead .brand {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .letterhead img.logo {
      width: 120px;
      height: auto;
      object-fit: contain;
      display: block;
    }
    .firm h1 {
      margin: 0 0 4px 0;
      font-size: 18px;
      font-weight: 700;
      color: #111827;
      letter-spacing: -0.005em;
    }
    .firm p { margin: 1px 0; font-size: 12px; color: #374151; }
    .contact { font-size: 12px; color: #374151; }
    .contact table { border-collapse: collapse; margin-left: auto; }
    .contact td { padding: 1px 0; vertical-align: top; }
    .contact td.k { color: #6b7280; font-weight: 600; padding-right: 8px; text-align: right; }
    .contact td.v { color: #111827; }
    .title-bar {
      text-align: center;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.18em;
      color: #111827;
      margin: 22px 0 14px 0;
    }
    .meta-bill {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 18px;
      gap: 24px;
    }
    .bill-to .lbl {
      font-size: 11px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .bill-to .who { font-size: 14px; font-weight: 600; color: #111827; }
    .meta table { border-collapse: collapse; font-size: 12px; }
    .meta td { padding: 2px 4px; }
    .meta td.k {
      color: #6b7280;
      font-weight: 600;
      text-align: right;
      padding-right: 10px;
    }
    .meta td.v { color: #111827; font-weight: 600; text-align: right; }
    table.items {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      font-size: 12px;
    }
    table.items th {
      background: #f3f4f6;
      color: #111827;
      font-weight: 700;
      text-align: left;
      padding: 8px 10px;
      border: 1px solid #d1d5db;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    table.items th.num { text-align: right; }
    table.items td {
      padding: 8px 10px;
      border: 1px solid #e5e7eb;
      vertical-align: top;
    }
    table.items td.num { text-align: right; font-variant-numeric: tabular-nums; }
    table.items td.desc { font-weight: 600; color: #111827; }
    table.items td.specs { color: #4b5563; }
    .below {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      margin-top: 10px;
    }
    .terms { width: 48%; font-size: 12px; }
    .terms .head { font-weight: 700; color: #111827; margin-bottom: 6px; }
    .terms .row { margin: 3px 0; color: #374151; }
    .totals { width: 48%; }
    .totals table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .totals td { padding: 5px 8px; }
    .totals td.lbl { color: #374151; text-align: left; }
    .totals td.amt {
      color: #111827;
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
    }
    .totals tr.grand td {
      border-top: 1.5px solid #B8860B;
      padding-top: 7px;
      font-weight: 700;
      font-size: 13px;
      color: #111827;
    }
    .note {
      margin-top: 18px;
      font-size: 11px;
      font-weight: 700;
      color: #111827;
      letter-spacing: 0.02em;
    }
    .tag {
      margin-top: 28px;
      padding-top: 14px;
      border-top: 1px solid #B8860B;
      text-align: center;
      font-size: 11px;
      font-style: italic;
      color: #6b7280;
      letter-spacing: 0.02em;
    }
    @media print {
      body { padding: 0; }
      @page { margin: 1.5cm; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="letterhead">
      <div class="brand">
        <img class="logo" src="${LOGO_DATA_URI}" alt="Donkor & Sons" />
        <div class="firm">
          <h1>Donkor and Sons Ltd.</h1>
          <p>P. O. Box 92 Agona Swedru, Central Region</p>
          <p>Ghana</p>
        </div>
      </div>
      <div class="contact">
        <table>
          <tr><td class="k">Web:</td><td class="v">www.donkorandsons.com</td></tr>
          <tr><td class="k">Email:</td><td class="v">info@donkorandsons.com</td></tr>
          <tr><td class="k">Mob. :</td><td class="v">0203915510 / 0243079555</td></tr>
        </table>
      </div>
    </div>

    <div class="title-bar">INVOICE</div>

    <div class="meta-bill">
      <div class="bill-to">
        <div class="lbl">Bill To:</div>
        <div class="who">${escape(invoice.customer_name)}</div>
      </div>
      <div class="meta">
        <table>
          <tr><td class="k">Invoice No.</td><td class="v">${escape(invoice.number)}</td></tr>
          <tr><td class="k">Date</td><td class="v">${escape(issuedDate)}</td></tr>
          <tr><td class="k">Due Date</td><td class="v">${escape(dueDate)}</td></tr>
          <tr><td class="k">Currency</td><td class="v">GHC</td></tr>
        </table>
      </div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th class="num" style="width: 38px;">S/n</th>
          <th>Description</th>
          <th>Specifications</th>
          <th class="num" style="width: 56px;">Qty</th>
          <th class="num" style="width: 110px;">Unit Price</th>
          <th class="num" style="width: 120px;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="below">
      <div class="terms">
        <div class="head">Payment Terms:</div>
        <div class="row">Initial Payment: ${invoice.initial_payment_percent}%</div>
        <div class="row">Before Delivery: ${invoice.before_delivery_percent}%</div>
        ${invoice.notes ? `<div class="row" style="margin-top:10px; white-space: pre-wrap;">${escape(invoice.notes)}</div>` : ''}
      </div>
      <div class="totals">
        <table>
          ${statutoryRows}
        </table>
      </div>
    </div>

    <div class="note">NOTE: PRICES QUOTED EXCLUDES TRANSPORTATION AND HANDLING</div>

    <div class="tag">Donkor and Sons............where every event becomes a memory.</div>
  </div>
</body>
</html>`;
}

export async function generateReceipt(db: Database, tenantId: string, paymentId: string): Promise<ArchivedDocument> {
  const payment = db
    .prepare(
      `SELECT p.id, p.invoice_id, p.kind, p.amount_pesewas, p.method, p.reference, p.paid_at,
              i.number, COALESCE(c.name, b.renter_name, 'Walk-in rental') AS customer_name,
              c.phone AS customer_phone, c.email AS customer_email
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       JOIN bookings b ON b.id = i.booking_id
       LEFT JOIN customers c ON c.id = b.customer_id
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
        customer_phone: string | null;
        customer_email: string | null;
      }
    | undefined;
  if (!payment) throw new Error('Payment not found');

  const invoice = readInvoiceBundle(db, tenantId, payment.invoice_id);
  const title = `Receipt - ${payment.number}`;

  const tableRows = invoice.lines.map((l) => [
    String(l.description),
    String(l.quantity),
    String(l.days),
    `GHS ${(Number(l.unit_price_pesewas) / 100).toFixed(2)}`,
    `GHS ${(Number(l.line_total_pesewas) / 100).toFixed(2)}`
  ]);

  const paymentDate = new Date(payment.paid_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const html = renderHtmlDocument({
    docType: 'RECEIPT',
    docNumber: payment.number,
    docDate: paymentDate,
    docStatus: 'PAID',
    customerName: payment.customer_name,
    customerPhone: payment.customer_phone,
    customerEmail: payment.customer_email,
    additionalInfo: [
      { label: 'Payment Method', value: payment.method.toUpperCase() },
      { label: 'Reference', value: payment.reference || 'N/A' }
    ],
    tableHeaders: ['Description', 'Qty', 'Days', 'Unit Price', 'Amount'],
    tableRows,
    subtotalPesewas: invoice.subtotal_pesewas,
    taxPesewas: invoice.tax_pesewas,
    discountPesewas: invoice.discount_pesewas,
    totalPesewas: invoice.total_pesewas,
    payments: [{ amount_pesewas: payment.amount_pesewas, method: payment.method, paid_at: payment.paid_at }],
    notes: invoice.notes
  });

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
      `SELECT b.id, b.starts_at, b.ends_at, b.pickup_location, b.dropoff_location, b.driver_name, b.notes,
              COALESCE(c.name, b.renter_name, 'Walk-in rental') AS customer_name,
              c.phone AS customer_phone, c.email AS customer_email
       FROM bookings b
       LEFT JOIN customers c ON c.id = b.customer_id
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
        notes: string | null;
        customer_name: string;
        customer_phone: string | null;
        customer_email: string | null;
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
      `SELECT i.id, i.number, i.status, i.subtotal_pesewas, i.tax_pesewas, i.discount_pesewas, i.total_pesewas,
              i.include_statutory_taxes, i.nhil_pesewas, i.getfund_pesewas, i.vat_pesewas,
              i.initial_payment_percent, i.before_delivery_percent,
              i.issued_at, i.due_at, i.notes,
              COALESCE(c.name, b.renter_name, 'Walk-in rental') AS customer_name,
              c.phone AS customer_phone, c.email AS customer_email,
              b.starts_at AS booking_starts_at, b.ends_at AS booking_ends_at
       FROM invoices i
       JOIN bookings b ON b.id = i.booking_id
       LEFT JOIN customers c ON c.id = b.customer_id
       WHERE i.id = @id AND i.tenant_id = @tenant_id AND i.deleted_at IS NULL`,
    )
    .get({ id: invoiceId, tenant_id: tenantId }) as
    | {
        id: string;
        number: string;
        status: string;
        subtotal_pesewas: number;
        tax_pesewas: number;
        discount_pesewas: number;
        total_pesewas: number;
        include_statutory_taxes: number;
        nhil_pesewas: number;
        getfund_pesewas: number;
        vat_pesewas: number;
        initial_payment_percent: number;
        before_delivery_percent: number;
        issued_at: string | null;
        due_at: string | null;
        notes: string | null;
        customer_name: string;
        customer_phone: string | null;
        customer_email: string | null;
        booking_starts_at: string;
        booking_ends_at: string;
      }
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
  
  const payments = db
    .prepare(
      `SELECT amount_pesewas, method, paid_at FROM payments
       WHERE invoice_id = @id AND tenant_id = @tenant_id AND deleted_at IS NULL
       ORDER BY paid_at ASC`,
    )
    .all({ id: invoiceId, tenant_id: tenantId }) as Array<{ amount_pesewas: number; method: string; paid_at: string }>;

  return {
    ...invoice,
    include_statutory_taxes: Boolean(invoice.include_statutory_taxes),
    lines: lines as Array<{
      description: string;
      quantity: number;
      days: number;
      unit_price_pesewas: number;
      line_total_pesewas: number;
    }>,
    payments,
  };
}

interface DocumentOptions {
  docType: 'INVOICE' | 'RECEIPT' | 'CONTRACT' | 'TRIP SHEET';
  docNumber: string;
  docDate: string;
  docStatus?: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  additionalInfo?: Array<{ label: string; value: string }>;
  tableHeaders: string[];
  tableRows: string[][];
  subtotalPesewas?: number;
  taxPesewas?: number;
  discountPesewas?: number;
  totalPesewas: number;
  payments?: Array<{ amount_pesewas: number; method: string; paid_at: string }>;
  notes?: string | null;
}

function renderHtmlDocument(options: DocumentOptions): string {
  const escape = escapeHtml;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escape(options.docType)} - ${escape(options.docNumber)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1F2937;
      margin: 0;
      padding: 40px;
      line-height: 1.5;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid #E5E7EB;
      padding-bottom: 24px;
      margin-bottom: 30px;
    }
    .company-info h1 {
      font-size: 24px;
      font-weight: 700;
      color: #111827;
      margin: 0 0 4px 0;
    }
    .company-info p {
      font-size: 13px;
      color: #4B5563;
      margin: 2px 0;
    }
    .doc-meta {
      text-align: right;
    }
    .doc-meta .doc-type {
      font-size: 40px;
      font-weight: 800;
      color: #E5E7EB;
      letter-spacing: -0.02em;
      text-transform: uppercase;
      line-height: 1;
      margin-bottom: 12px;
    }
    .meta-table {
      font-size: 13px;
      border-collapse: collapse;
      margin-left: auto;
    }
    .meta-table td {
      padding: 4px 8px;
      text-align: right;
      border: none;
    }
    .meta-table td.label {
      color: #6B7280;
      font-weight: 500;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.05em;
    }
    .meta-table td.value {
      color: #111827;
      font-weight: 600;
    }
    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 700;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .status-badge.paid { background: #D1FAE5; color: #065F46; }
    .status-badge.issued { background: #DBEAFE; color: #1E40AF; }
    .status-badge.draft { background: #FEF3C7; color: #92400E; }
    .status-badge.void { background: #FEE2E2; color: #991B1B; }
    .status-badge.generic { background: #F3F4F6; color: #374151; }

    .bill-to-section {
      margin-bottom: 30px;
    }
    .bill-to-title {
      font-size: 11px;
      font-weight: 700;
      color: #9CA3AF;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 8px;
    }
    .bill-to-name {
      font-size: 16px;
      font-weight: 700;
      color: #111827;
      margin: 0 0 4px 0;
    }
    .bill-to-info {
      font-size: 13px;
      color: #4B5563;
      margin: 2px 0;
    }

    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    .items-table th {
      border-bottom: 1px solid #E5E7EB;
      color: #9CA3AF;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 10px 12px;
      text-align: left;
    }
    .items-table th.num { text-align: right; }
    .items-table td {
      border-bottom: 1px solid #F3F4F6;
      padding: 12px;
      font-size: 13px;
      color: #374151;
    }
    .items-table td.item-name {
      font-weight: 600;
      color: #111827;
    }
    .items-table td.num { text-align: right; }

    .footer-grid {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-top: 20px;
    }
    .footer-left {
      width: 50%;
    }
    .footer-right {
      width: 45%;
    }
    .notes-card {
      background: #F9FAFB;
      border-radius: 6px;
      padding: 12px 16px;
      margin-bottom: 16px;
    }
    .notes-card .title {
      font-size: 11px;
      font-weight: 700;
      color: #6B7280;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
    }
    .notes-card .body {
      font-size: 12px;
      color: #4B5563;
      white-space: pre-wrap;
    }
    .signature-block {
      margin-top: 40px;
      border-top: 1px dashed #D1D5DB;
      padding-top: 12px;
      font-size: 13px;
      color: #4B5563;
    }
    .totals-table {
      width: 100%;
      border-collapse: collapse;
    }
    .totals-table td {
      padding: 6px 12px;
      font-size: 13px;
      color: #4B5563;
      text-align: right;
    }
    .totals-table td.label {
      text-align: left;
      font-weight: 500;
    }
    .totals-table tr.grand-total td {
      border-top: 1px solid #E5E7EB;
      font-size: 16px;
      font-weight: 700;
      color: #111827;
      padding-top: 12px;
    }
    .totals-table tr.green-total td {
      color: #059669;
      font-weight: 600;
    }

    @media print {
      body { padding: 0; }
      @page { margin: 1.5cm; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="company-info">
        <h1>Donkor &amp; Sons</h1>
        <p>Premium Equipment &amp; Hearse Services</p>
        <p>Accra, Ghana</p>
        <p>+233 20 000 0000 | info@donkorrentals.com</p>
      </div>
      <div class="doc-meta">
        <div class="doc-type">${escape(options.docType)}</div>
        <table class="meta-table">
          <tr>
            <td class="label">${escape(options.docType)} #</td>
            <td class="value">${escape(options.docNumber)}</td>
          </tr>
          <tr>
            <td class="label">Date</td>
            <td class="value">${escape(options.docDate)}</td>
          </tr>
          ${options.docStatus ? `
          <tr>
            <td class="label">Status</td>
            <td class="value">
              <span class="status-badge ${options.docStatus.toLowerCase()}">${escape(options.docStatus)}</span>
            </td>
          </tr>
          ` : ''}
          ${(options.additionalInfo || []).map(info => `
          <tr>
            <td class="label">${escape(info.label)}</td>
            <td class="value">${escape(info.value)}</td>
          </tr>
          `).join('')}
        </table>
      </div>
    </header>

    <div class="bill-to-section">
      <div class="bill-to-title">Bill To</div>
      <div class="bill-to-name">${escape(options.customerName)}</div>
      ${options.customerPhone ? `<div class="bill-to-info">${escape(options.customerPhone)}</div>` : ''}
      ${options.customerEmail ? `<div class="bill-to-info">${escape(options.customerEmail)}</div>` : ''}
    </div>

    <table class="items-table">
      <thead>
        <tr>
          ${options.tableHeaders.map((h, i) => `<th class="${i > 0 ? 'num' : ''}">${escape(h)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${options.tableRows.map(row => `
        <tr>
          ${row.map((cell, i) => `<td class="${i === 0 ? 'item-name' : 'num'}">${escape(cell)}</td>`).join('')}
        </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="footer-grid">
      <div class="footer-left">
        ${options.notes ? `
        <div class="notes-card">
          <div class="title">Notes</div>
          <div class="body">${escape(options.notes)}</div>
        </div>
        ` : ''}
        ${options.docType === 'CONTRACT' ? `
        <div class="signature-block">
          Customer Signature: ___________________________
        </div>
        ` : ''}
        ${options.docType === 'TRIP SHEET' ? `
        <div class="signature-block">
          Driver Signature: ___________________________
        </div>
        ` : ''}
      </div>
      <div class="footer-right">
        <table class="totals-table">
          ${options.subtotalPesewas !== undefined ? `
          <tr>
            <td class="label">Subtotal</td>
            <td>GHS ${(options.subtotalPesewas / 100).toFixed(2)}</td>
          </tr>
          ` : ''}
          ${options.taxPesewas ? `
          <tr>
            <td class="label">Tax</td>
            <td>GHS ${(options.taxPesewas / 100).toFixed(2)}</td>
          </tr>
          ` : ''}
          ${options.discountPesewas ? `
          <tr>
            <td class="label">Discount</td>
            <td>- GHS ${(options.discountPesewas / 100).toFixed(2)}</td>
          </tr>
          ` : ''}
          ${options.docType !== 'TRIP SHEET' ? `
          <tr class="grand-total">
            <td class="label">${options.docType === 'CONTRACT' ? 'Total / Day' : 'Total Due'}</td>
            <td>GHS ${(options.totalPesewas / 100).toFixed(2)}</td>
          </tr>
          ` : ''}
          ${(options.payments || []).map(p => `
          <tr class="green-total">
            <td class="label">Paid via ${p.method.toUpperCase()}</td>
            <td>GHS ${(p.amount_pesewas / 100).toFixed(2)}</td>
          </tr>
          `).join('')}
        </table>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
