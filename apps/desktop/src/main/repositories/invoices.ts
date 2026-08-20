import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import {
  type Invoice,
  type InvoiceLine,
  type InvoiceCreateFromBooking,
  type InvoiceUpdateInput,
  type InvoiceFilter,
  type Payment,
  type PaymentCreateInput,
} from '@shared/schemas';
import { format as formatMoney } from '@shared/money';
import {
  buildDepositAppliedEntry,
  buildDepositReceivedEntry,
  buildInvoiceIssuedEntry,
  buildPaymentReceivedEntry,
  buildRefundedEntry,
  postOnce,
  reverseEntry,
} from '../accounting/posting';
import { resolveAccount, resolveCashAccount } from '../accounting/chart';
import { toEntryDate } from '../accounting/dates';

const INVOICE_COLS = `id, tenant_id, booking_id, number, status, issued_at, due_at,
  subtotal_pesewas, tax_pesewas, discount_pesewas, total_pesewas,
  include_statutory_taxes, nhil_pesewas, getfund_pesewas, vat_pesewas,
  initial_payment_percent, before_delivery_percent,
  notes, created_at, updated_at, deleted_at`;

const LINE_COLS = `id, tenant_id, invoice_id, booking_line_id, description,
  quantity, days, unit_price_pesewas, line_total_pesewas, sort_order,
  created_at, updated_at, deleted_at`;

const PAYMENT_COLS = `id, tenant_id, invoice_id, kind, amount_pesewas, method,
  reference, paid_at, notes, created_at, updated_at, deleted_at`;

function nowIso(): string { return new Date().toISOString(); }

/**
 * Ghana statutory tax breakdown — cascading method (current standard since 2018).
 *
 *   nhil    = round(subtotal * 0.025)
 *   getfund = round(subtotal * 0.025)
 *   vat     = round((subtotal + nhil + getfund) * 0.15)
 *
 * `total_inclusive` is `subtotal + nhil + getfund + vat` — discounts are applied
 * by the caller. All values are pesewas (integers).
 */
export function computeStatutoryTaxes(subtotal_pesewas: number): {
  nhil: number;
  getfund: number;
  vat: number;
  total_inclusive: number;
} {
  const subtotal = Math.max(0, Math.round(subtotal_pesewas));
  const nhil = Math.round(subtotal * 0.025);
  const getfund = Math.round(subtotal * 0.025);
  const vat = Math.round((subtotal + nhil + getfund) * 0.15);
  return { nhil, getfund, vat, total_inclusive: subtotal + nhil + getfund + vat };
}

function mapInvoiceRow<T extends { include_statutory_taxes: number | boolean }>(row: T): Omit<T, 'include_statutory_taxes'> & { include_statutory_taxes: boolean } {
  return { ...row, include_statutory_taxes: Boolean(row.include_statutory_taxes) };
}

function nextInvoiceNumber(db: Database, tenantId: string): string {
  // Atomic increment: insert seed then update returning.
  db.prepare(
    `INSERT INTO invoice_sequences (tenant_id, next_value) VALUES (@t, 1)
     ON CONFLICT(tenant_id) DO NOTHING`,
  ).run({ t: tenantId });
  const row = db
    .prepare(`UPDATE invoice_sequences SET next_value = next_value + 1
              WHERE tenant_id = @t RETURNING next_value - 1 AS used`)
    .get({ t: tenantId }) as { used: number };
  return `INV-${String(row.used).padStart(6, '0')}`;
}

/**
 * A discount cannot exceed what is being discounted.
 *
 * Creation clamped the stored total at zero while assertInvoiceTotals insisted
 * total === subtotal + levies - discount, so an over-large discount produced an
 * invoice that saved happily and then refused to issue for ever, with an error
 * blaming the totals rather than the discount. Catch it where it is entered.
 */
function assertDiscountFits(discount: number, totalInclusive: number): void {
  if (discount > totalInclusive) {
    throw new Error(
      `Discount of ${formatMoney(discount)} is more than the ${formatMoney(totalInclusive)} being invoiced.`,
    );
  }
}

function assertInvoiceTotals(invoice: InvoiceWithLines): void {
  const lineTotal = invoice.lines.reduce((sum, line) => sum + line.line_total_pesewas, 0);
  if (invoice.subtotal_pesewas !== lineTotal) {
    throw new Error(`Invoice ${invoice.number} subtotal does not equal line totals`);
  }
  const expected = invoice.subtotal_pesewas + invoice.nhil_pesewas + invoice.getfund_pesewas + invoice.vat_pesewas - invoice.discount_pesewas;
  if (invoice.total_pesewas !== expected) {
    throw new Error(`Invoice ${invoice.number} total does not equal stored subtotal/tax/discount values`);
  }
}

function getInvoiceCustomerId(db: Database, invoice: Pick<InvoiceWithLines, 'booking_id'>): string | null {
  const row = db
    .prepare('SELECT customer_id FROM bookings WHERE id = @id')
    .get({ id: invoice.booking_id }) as { customer_id: string | null } | undefined;
  return row?.customer_id ?? null;
}

function postInvoiceIssued(db: Database, tenantId: string, invoice: InvoiceWithLines): void {
  assertInvoiceTotals(invoice);
  const incomeParty = resolveAccount(db, tenantId, 'income.party_supply');
  const incomeHearse = resolveAccount(db, tenantId, 'income.hearse');
  const incomeDefault = resolveAccount(db, tenantId, 'income.default');
  const incomeRows = db
    .prepare(
      `SELECT il.line_total_pesewas, il.description, bl.item_id, bl.item_unit_id, i.kind AS item_kind
       FROM invoice_lines il
       LEFT JOIN booking_lines bl ON bl.id = il.booking_line_id AND bl.tenant_id = il.tenant_id
       LEFT JOIN items i ON i.id = bl.item_id AND i.tenant_id = il.tenant_id
       WHERE il.invoice_id = @invoice_id AND il.tenant_id = @tenant_id AND il.deleted_at IS NULL
       ORDER BY il.sort_order ASC, il.created_at ASC`,
    )
    .all({ invoice_id: invoice.id, tenant_id: tenantId }) as Array<{
      line_total_pesewas: number;
      description: string;
      item_id: string | null;
      item_unit_id: string | null;
      item_kind: 'party_supply' | 'hearse' | null;
    }>;
  postOnce(db, tenantId, buildInvoiceIssuedEntry({
    entry_date: toEntryDate(invoice.issued_at ?? nowIso()),
    invoice_id: invoice.id,
    invoice_number: invoice.number,
    customer_id: getInvoiceCustomerId(db, invoice),
    ar_account_id: resolveAccount(db, tenantId, 'ar'),
    discounts_given_account_id: resolveAccount(db, tenantId, 'discounts_given'),
    nhil_payable_account_id: resolveAccount(db, tenantId, 'tax.nhil_payable'),
    getfund_payable_account_id: resolveAccount(db, tenantId, 'tax.getfund_payable'),
    vat_payable_account_id: resolveAccount(db, tenantId, 'tax.vat_payable'),
    total_pesewas: invoice.total_pesewas,
    subtotal_pesewas: invoice.subtotal_pesewas,
    discount_pesewas: invoice.discount_pesewas,
    nhil_pesewas: invoice.nhil_pesewas,
    getfund_pesewas: invoice.getfund_pesewas,
    vat_pesewas: invoice.vat_pesewas,
    income_default_account_id: incomeDefault,
    income_lines: incomeRows.map((row) => ({
      account_id: row.item_kind === 'hearse' ? incomeHearse : row.item_kind === 'party_supply' ? incomeParty : incomeDefault,
      amount_pesewas: row.line_total_pesewas,
      memo: row.description,
      item_id: row.item_id,
      item_unit_id: row.item_unit_id,
    })),
  }));
  const advances = db
    .prepare(
      `SELECT COALESCE(SUM(amount_pesewas), 0) AS n
       FROM payments
       WHERE invoice_id = @invoice_id AND tenant_id = @tenant_id AND kind = 'deposit' AND deleted_at IS NULL`,
    )
    .get({ invoice_id: invoice.id, tenant_id: tenantId }) as { n: number };
  postOnce(db, tenantId, buildDepositAppliedEntry({
    entry_date: toEntryDate(invoice.issued_at ?? nowIso()),
    invoice_id: invoice.id,
    customer_deposits_account_id: resolveAccount(db, tenantId, 'customer_deposits'),
    ar_account_id: resolveAccount(db, tenantId, 'ar'),
    advances_pesewas: advances.n,
    invoice_total_pesewas: invoice.total_pesewas,
    customer_id: getInvoiceCustomerId(db, invoice),
  }));
}

function daysBetween(starts: string, ends: string): number {
  const ms = new Date(ends).getTime() - new Date(starts).getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export interface InvoiceWithLines extends Invoice {
  customer_name: string;
  booking_starts_at: string;
  booking_ends_at: string;
  lines: InvoiceLine[];
  payments: Payment[];
  amount_paid_pesewas: number;
  balance_due_pesewas: number;
}

export function listInvoices(
  db: Database,
  tenantId: string,
  filter: InvoiceFilter = {},
): Array<Invoice & { customer_name: string; amount_paid_pesewas: number; balance_due_pesewas: number }> {
  const params: Record<string, unknown> = { tenant_id: tenantId };
  let sql = `
    SELECT ${INVOICE_COLS.split(',').map((c) => `i.${c.trim()}`).join(', ')},
           COALESCE(c.name, b.renter_name, 'Walk-in rental') AS customer_name,
           COALESCE((
             SELECT SUM(CASE WHEN p.kind = 'refund' THEN -p.amount_pesewas ELSE p.amount_pesewas END)
             FROM payments p
             WHERE p.invoice_id = i.id AND p.deleted_at IS NULL
           ), 0) AS amount_paid_pesewas
    FROM invoices i
    JOIN bookings  b ON b.id = i.booking_id
    LEFT JOIN customers c ON c.id = b.customer_id
    WHERE i.tenant_id = @tenant_id`;
  if (!filter.includeDeleted) sql += ' AND i.deleted_at IS NULL';
  if (filter.status) {
    sql += ' AND i.status = @status';
    params.status = filter.status;
  }
  if (filter.bookingId) {
    sql += ' AND i.booking_id = @booking_id';
    params.booking_id = filter.bookingId;
  }
  if (filter.search) {
    sql += " AND (i.number LIKE @q OR COALESCE(c.name, b.renter_name, 'Walk-in rental') LIKE @q)";
    params.q = `%${filter.search}%`;
  }
  sql += ' ORDER BY i.created_at DESC';
  const rows = db.prepare(sql).all(params) as Array<
    Omit<Invoice, 'include_statutory_taxes'> & {
      include_statutory_taxes: number;
      customer_name: string;
      amount_paid_pesewas: number;
    }
  >;
  return rows.map((r) => ({
    ...mapInvoiceRow(r),
    balance_due_pesewas: r.total_pesewas - r.amount_paid_pesewas,
  }));
}

export function getInvoice(
  db: Database,
  tenantId: string,
  id: string,
): InvoiceWithLines | null {
  const row = db
    .prepare(
      `SELECT ${INVOICE_COLS.split(',').map((c) => `i.${c.trim()}`).join(', ')},
              COALESCE(c.name, b.renter_name, 'Walk-in rental') AS customer_name,
              b.starts_at AS booking_starts_at,
              b.ends_at   AS booking_ends_at
       FROM invoices i
       JOIN bookings  b ON b.id = i.booking_id
       LEFT JOIN customers c ON c.id = b.customer_id
       WHERE i.id = @id AND i.tenant_id = @tenant_id`,
    )
    .get({ id, tenant_id: tenantId }) as
    | (Omit<Invoice, 'include_statutory_taxes'> & {
        include_statutory_taxes: number;
        customer_name: string;
        booking_starts_at: string;
        booking_ends_at: string;
      })
    | undefined;
  if (!row) return null;
  const invoiceRow = mapInvoiceRow(row);
  const lines = db
    .prepare(
      `SELECT ${LINE_COLS} FROM invoice_lines
       WHERE invoice_id = @id AND tenant_id = @tenant_id AND deleted_at IS NULL
       ORDER BY sort_order ASC, created_at ASC`,
    )
    .all({ id, tenant_id: tenantId }) as InvoiceLine[];
  const payments = db
    .prepare(
      `SELECT ${PAYMENT_COLS} FROM payments
       WHERE invoice_id = @id AND tenant_id = @tenant_id AND deleted_at IS NULL
       ORDER BY paid_at ASC`,
    )
    .all({ id, tenant_id: tenantId }) as Payment[];
  const amount_paid_pesewas = payments.reduce(
    (acc, p) => acc + (p.kind === 'refund' ? -p.amount_pesewas : p.amount_pesewas),
    0,
  );
  return {
    ...invoiceRow,
    lines,
    payments,
    amount_paid_pesewas,
    balance_due_pesewas: invoiceRow.total_pesewas - amount_paid_pesewas,
  };
}

/**
 * Generate an invoice from a booking. Lines are derived from booking_lines:
 *   description = "<item name>" (with hearse plate if any)
 *   quantity    = booking_line.quantity
 *   days        = ceil(end-start in days), shared across lines
 *   unit_price  = booking_line.daily_rate_pesewas
 *   line_total  = unit_price * quantity * days
 */
interface BookingQuote {
  booking: { id: string; starts_at: string; ends_at: string; customer_id: string | null };
  days: number;
  lineDrafts: Array<{
    booking_line_id: string;
    description: string;
    quantity: number;
    days: number;
    unit_price_pesewas: number;
    line_total_pesewas: number;
    sort_order: number;
  }>;
  subtotal: number;
  breakdown: { nhil: number; getfund: number; vat: number; total_inclusive: number };
  discount: number;
  total: number;
}

/**
 * Price a booking exactly as an invoice would, without writing anything.
 *
 * This is the single place a booking turns into money. createInvoiceFromBooking
 * writes what it returns; previewInvoiceForBooking shows it to the person about
 * to take payment; takePaymentForBooking charges it. Because all three call
 * this, the figure on the payment sheet, the figure on the invoice, and the
 * figure in the ledger cannot disagree — whichever button was pressed.
 */
function quoteInvoiceForBooking(
  db: Database,
  tenantId: string,
  bookingId: string,
  opts: { includeStatutory: boolean; discount: number },
): BookingQuote {
  const booking = db
    .prepare(
      `SELECT id, starts_at, ends_at, customer_id FROM bookings
       WHERE id = @id AND tenant_id = @tenant_id AND deleted_at IS NULL`,
    )
    .get({ id: bookingId, tenant_id: tenantId }) as
    | { id: string; starts_at: string; ends_at: string; customer_id: string | null }
    | undefined;
  if (!booking) throw new Error('Booking not found');

  const days = daysBetween(booking.starts_at, booking.ends_at);

  // Fetch booking lines and the joined item info for descriptions.
  const blines = db
    .prepare(
      `SELECT bl.id, bl.item_id, bl.item_unit_id, bl.quantity, bl.daily_rate_pesewas,
              i.name AS item_name, i.kind AS item_kind, i.sku AS sku,
              u.identifier AS unit_identifier, u.plate AS plate
       FROM booking_lines bl
       JOIN items i ON i.id = bl.item_id
       LEFT JOIN item_units u ON u.id = bl.item_unit_id
       WHERE bl.booking_id = @booking_id AND bl.tenant_id = @tenant_id AND bl.deleted_at IS NULL
       ORDER BY bl.created_at ASC`,
    )
    .all({ booking_id: booking.id, tenant_id: tenantId }) as Array<{
      id: string;
      item_id: string;
      item_unit_id: string | null;
      quantity: number;
      daily_rate_pesewas: number;
      item_name: string;
      item_kind: 'party_supply' | 'hearse';
      sku: string;
      unit_identifier: string | null;
      plate: string | null;
    }>;

  if (blines.length === 0) throw new Error('Booking has no lines to invoice');

  let subtotal = 0;
  const lineDrafts = blines.map((bl, idx) => {
    const description = bl.unit_identifier
      ? `${bl.item_name} · ${bl.unit_identifier}${bl.plate ? ` (${bl.plate})` : ''}`
      : bl.item_name;
    const lineTotal = bl.daily_rate_pesewas * bl.quantity * days;
    subtotal += lineTotal;
    return {
      booking_line_id: bl.id,
      description,
      quantity: bl.quantity,
      days,
      unit_price_pesewas: bl.daily_rate_pesewas,
      line_total_pesewas: lineTotal,
      sort_order: idx,
    };
  });

  const breakdown = opts.includeStatutory
    ? computeStatutoryTaxes(subtotal)
    : { nhil: 0, getfund: 0, vat: 0, total_inclusive: subtotal };
  assertDiscountFits(opts.discount, breakdown.total_inclusive);
  const total = breakdown.total_inclusive - opts.discount;

  return { booking, days, lineDrafts, subtotal, breakdown, discount: opts.discount, total };
}

/** What the payment sheet shows before any invoice exists. */
export interface InvoicePreview {
  days: number;
  subtotal_pesewas: number;
  nhil_pesewas: number;
  getfund_pesewas: number;
  vat_pesewas: number;
  total_pesewas: number;
  include_statutory_taxes: boolean;
}

/**
 * Defaults the quick path uses when it has to raise the invoice itself. These
 * are the New Invoice form's own defaults, on purpose: taking payment from the
 * booking must land on the same total as walking through the form and accepting
 * what it offers. If that form's defaults change, change these with them.
 */
const QUICK_INVOICE_DEFAULTS = { includeStatutory: true, discount: 0 } as const;

export function previewInvoiceForBooking(
  db: Database,
  tenantId: string,
  bookingId: string,
  // The counter can sell either way: Statutory adds NHIL/GETFund/VAT, Simple
  // charges the subtotal alone. Same choice the New Invoice form offers.
  includeStatutory: boolean = QUICK_INVOICE_DEFAULTS.includeStatutory,
): InvoicePreview {
  const q = quoteInvoiceForBooking(db, tenantId, bookingId, {
    includeStatutory,
    discount: QUICK_INVOICE_DEFAULTS.discount,
  });
  return {
    days: q.days,
    subtotal_pesewas: q.subtotal,
    nhil_pesewas: q.breakdown.nhil,
    getfund_pesewas: q.breakdown.getfund,
    vat_pesewas: q.breakdown.vat,
    total_pesewas: q.total,
    include_statutory_taxes: includeStatutory,
  };
}

export function createInvoiceFromBooking(
  db: Database,
  tenantId: string,
  input: InvoiceCreateFromBooking,
): InvoiceWithLines {
  const includeStatutory = input.include_statutory_taxes ?? true;
  const discount = input.discount_pesewas ?? 0;
  const initialPct = input.initial_payment_percent ?? 50;
  const beforeDeliveryPct = input.before_delivery_percent ?? 50;

  const { booking, lineDrafts, subtotal, breakdown, total } =
    quoteInvoiceForBooking(db, tenantId, input.booking_id, { includeStatutory, discount });

  const id = uuidv4();
  const now = nowIso();

  const insertInvoice = db.prepare(
    `INSERT INTO invoices (${INVOICE_COLS})
     VALUES (@id, @tenant_id, @booking_id, @number, 'draft', NULL, @due_at,
             @subtotal_pesewas, @tax_pesewas, @discount_pesewas, @total_pesewas,
             @include_statutory_taxes, @nhil_pesewas, @getfund_pesewas, @vat_pesewas,
             @initial_payment_percent, @before_delivery_percent,
             @notes, @created_at, @updated_at, NULL)`,
  );
  const insertLine = db.prepare(
    `INSERT INTO invoice_lines (${LINE_COLS})
     VALUES (@id, @tenant_id, @invoice_id, @booking_line_id, @description,
             @quantity, @days, @unit_price_pesewas, @line_total_pesewas, @sort_order,
             @created_at, @updated_at, NULL)`,
  );

  const tx = db.transaction(() => {
    const number = nextInvoiceNumber(db, tenantId);
    insertInvoice.run({
      id,
      tenant_id: tenantId,
      booking_id: booking.id,
      number,
      due_at: input.due_at ?? null,
      subtotal_pesewas: subtotal,
      tax_pesewas: 0,
      discount_pesewas: discount,
      total_pesewas: total,
      include_statutory_taxes: includeStatutory ? 1 : 0,
      nhil_pesewas: breakdown.nhil,
      getfund_pesewas: breakdown.getfund,
      vat_pesewas: breakdown.vat,
      initial_payment_percent: initialPct,
      before_delivery_percent: beforeDeliveryPct,
      notes: input.notes ?? null,
      created_at: now,
      updated_at: now,
    });
    for (const ld of lineDrafts) {
      insertLine.run({
        id: uuidv4(),
        tenant_id: tenantId,
        invoice_id: id,
        booking_line_id: ld.booking_line_id,
        description: ld.description,
        quantity: ld.quantity,
        days: ld.days,
        unit_price_pesewas: ld.unit_price_pesewas,
        line_total_pesewas: ld.line_total_pesewas,
        sort_order: ld.sort_order,
        created_at: now,
        updated_at: now,
      });
    }
  });
  tx();

  const created = getInvoice(db, tenantId, id);
  if (!created) throw new Error('createInvoiceFromBooking: readback failed');
  return created;
}

export function updateInvoice(
  db: Database,
  tenantId: string,
  id: string,
  patch: InvoiceUpdateInput,
): InvoiceWithLines {
  const existing = getInvoice(db, tenantId, id);
  if (!existing) throw new Error(`updateInvoice: invoice ${id} not found`);
  if (
    existing.status !== 'draft' &&
    (patch.discount_pesewas !== undefined || patch.include_statutory_taxes !== undefined)
  ) {
    throw new Error('Issued invoices cannot be re-priced -- void and re-issue');
  }

  // Status moves with side-effects.
  let issued_at = existing.issued_at;
  if (patch.status && patch.status !== existing.status) {
    // A draft covered in full by a deposit has a zero balance, so it slipped
    // past the guard below and went straight to paid — never passing through
    // 'issued', and so never posting its revenue or its statutory tax. Leaving
    // the draft is what makes an invoice real, whichever status it lands in.
    if ((patch.status === 'issued' || patch.status === 'paid') && !issued_at) issued_at = nowIso();
    if (patch.status === 'paid' && existing.balance_due_pesewas > 0) {
      throw new Error('Cannot mark paid: balance is still outstanding');
    }
  }

  const includeStatutory = patch.include_statutory_taxes ?? existing.include_statutory_taxes;
  const discount = patch.discount_pesewas ?? existing.discount_pesewas;
  const initialPct = patch.initial_payment_percent ?? existing.initial_payment_percent;
  const beforeDeliveryPct = patch.before_delivery_percent ?? existing.before_delivery_percent;

  const breakdown = includeStatutory
    ? computeStatutoryTaxes(existing.subtotal_pesewas)
    : { nhil: 0, getfund: 0, vat: 0, total_inclusive: existing.subtotal_pesewas };
  assertDiscountFits(discount, breakdown.total_inclusive);
  const total = breakdown.total_inclusive - discount;

  const tx = db.transaction(() => {
    const updatedAt = nowIso();
    db.prepare(
      `UPDATE invoices SET
         status = @status, issued_at = @issued_at, due_at = @due_at,
         discount_pesewas = @discount_pesewas, total_pesewas = @total_pesewas,
         include_statutory_taxes = @include_statutory_taxes,
         nhil_pesewas = @nhil_pesewas, getfund_pesewas = @getfund_pesewas, vat_pesewas = @vat_pesewas,
         initial_payment_percent = @initial_payment_percent,
         before_delivery_percent = @before_delivery_percent,
         notes = @notes, updated_at = @updated_at
       WHERE id = @id AND tenant_id = @tenant_id`,
    ).run({
      id,
      tenant_id: tenantId,
      status: patch.status ?? existing.status,
      issued_at,
      due_at: patch.due_at ?? existing.due_at,
      discount_pesewas: discount,
      total_pesewas: total,
      include_statutory_taxes: includeStatutory ? 1 : 0,
      nhil_pesewas: breakdown.nhil,
      getfund_pesewas: breakdown.getfund,
      vat_pesewas: breakdown.vat,
      initial_payment_percent: initialPct,
      before_delivery_percent: beforeDeliveryPct,
      notes: patch.notes !== undefined ? patch.notes : existing.notes,
      updated_at: updatedAt,
    });
    const current = getInvoice(db, tenantId, id);
    if (!current) throw new Error('updateInvoice: readback failed');
    if ((patch.status === 'issued' || patch.status === 'paid') && existing.status === 'draft') {
      postInvoiceIssued(db, tenantId, current);
    }
    if (patch.status === 'void' && existing.status !== 'void') {
      // Voiding reverses the issue entry, which credits A/R back. If money has
      // already been received against the invoice those payment credits stay on
      // the books, and A/R is left with a credit balance equal to the amount
      // paid — the ledger stops tying to the invoice sub-ledger. Refund first,
      // then void.
      if (current.amount_paid_pesewas > 0) {
        throw new Error(
          `Cannot void invoice ${current.number} — ${formatMoney(current.amount_paid_pesewas)} ` +
            `has been received against it. Refund the payments first, then void.`,
        );
      }
      const entries = db
        .prepare(
          `SELECT id FROM journal_entries
           WHERE tenant_id = @tenant_id AND source_type = 'invoice' AND source_id = @invoice_id
             AND reversed_by_id IS NULL
           ORDER BY entry_no ASC`,
        )
        .all({ tenant_id: tenantId, invoice_id: id }) as Array<{ id: string }>;
      for (const entry of entries) {
        reverseEntry(db, tenantId, entry.id, toEntryDate(updatedAt), `Invoice ${current.number} voided`);
      }
    }
  });
  tx();
  const after = getInvoice(db, tenantId, id);
  if (!after) throw new Error('updateInvoice: readback failed');
  return after;
}

export function softDeleteInvoice(db: Database, tenantId: string, id: string): void {
  const existing = getInvoice(db, tenantId, id);
  if (!existing) throw new Error(`softDeleteInvoice: invoice ${id} not found`);
  if (existing.status !== 'draft') throw new Error('Only draft invoices can be deleted');
  db.prepare(
    `UPDATE invoices SET deleted_at = @t, updated_at = @t
     WHERE id = @id AND tenant_id = @tenant_id AND deleted_at IS NULL`,
  ).run({ id, tenant_id: tenantId, t: nowIso() });
}

// --- Payments --------------------------------------------------------------

/** Focused balance + status read used inside the payment transaction. */
function readBalance(
  db: Database,
  tenantId: string,
  invoiceId: string,
): { total: number; paid: number; status: string; booking_id: string } | null {
  return (
    (db
      .prepare(
        `SELECT i.total_pesewas AS total, i.status AS status, i.booking_id AS booking_id,
                COALESCE((
                  SELECT SUM(CASE WHEN p.kind = 'refund' THEN -p.amount_pesewas ELSE p.amount_pesewas END)
                  FROM payments p
                  WHERE p.invoice_id = i.id AND p.deleted_at IS NULL
                ), 0) AS paid
         FROM invoices i
         WHERE i.id = @id AND i.tenant_id = @tenant_id AND i.deleted_at IS NULL`,
      )
      .get({ id: invoiceId, tenant_id: tenantId }) as
      | { total: number; paid: number; status: string; booking_id: string }
      | undefined) ?? null
  );
}

/**
 * Take payment against a booking — the walk-in, pay-at-the-counter path.
 *
 * Small rentals do not need anyone to "go through invoicing"; they need the
 * money taken and a receipt handed over. But every payment in this system is
 * recorded against an invoice, because the invoice is what posts the sale to
 * income — without it the P&L is silent. So this raises the paperwork the
 * person should never have to look at: it finds the booking's open invoice or
 * creates one on the New Invoice form's defaults, issues it if it is still a
 * draft, and records the payment. One transaction; all of it or none of it.
 *
 * This is what QuickBooks calls a Sales Receipt as distinct from an Invoice.
 * Both record the sale; the only difference is whether anyone has to wait for
 * the money.
 *
 * Never raises a second invoice for a booking that already has a live one:
 * "Take payment" on a booking someone has already started invoicing pays that
 * invoice. A voided invoice does not count as live.
 */
export function takePaymentForBooking(
  db: Database,
  tenantId: string,
  input: {
    booking_id: string;
    amount_pesewas: number;
    method: PaymentCreateInput['method'];
    paid_at: string;
    include_statutory_taxes?: boolean | undefined;
    reference?: string | null | undefined;
    notes?: string | null | undefined;
  },
): { invoice: InvoiceWithLines; payment: Payment; created_invoice: boolean } {
  const tx = db.transaction(() => {
    const booking = db
      .prepare('SELECT id, status FROM bookings WHERE id = @id AND tenant_id = @tenant_id AND deleted_at IS NULL')
      .get({ id: input.booking_id, tenant_id: tenantId }) as { id: string; status: string } | undefined;
    if (!booking) throw new Error('Booking not found');
    if (booking.status === 'cancelled') throw new Error('This booking was cancelled. Reinstate it before taking payment.');

    const live = db
      .prepare(
        `SELECT id FROM invoices
         WHERE booking_id = @booking_id AND tenant_id = @tenant_id
           AND deleted_at IS NULL AND status <> 'void'
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get({ booking_id: input.booking_id, tenant_id: tenantId }) as { id: string } | undefined;

    let created = false;
    let invoice: InvoiceWithLines;
    if (live) {
      const found = getInvoice(db, tenantId, live.id);
      if (!found) throw new Error('takePaymentForBooking: invoice readback failed');
      invoice = found;
      // An existing invoice has already fixed the tax format — its total is
      // what the customer owes and what the ledger will post. A contradicting
      // choice from the sheet means the screen and the books are about to
      // disagree about the price, so refuse rather than silently charge a
      // total the person never saw. (The sheet hides the choice whenever an
      // invoice exists; this trips only if a stale screen slips through.)
      if (
        input.include_statutory_taxes !== undefined &&
        input.include_statutory_taxes !== invoice.include_statutory_taxes
      ) {
        throw new Error(
          `This booking is already invoiced ${invoice.include_statutory_taxes ? 'with' : 'without'} statutory taxes. ` +
            'Void that invoice first to change the format.',
        );
      }
    } else {
      invoice = createInvoiceFromBooking(db, tenantId, {
        booking_id: input.booking_id,
        include_statutory_taxes: input.include_statutory_taxes ?? QUICK_INVOICE_DEFAULTS.includeStatutory,
        discount_pesewas: QUICK_INVOICE_DEFAULTS.discount,
      } as InvoiceCreateFromBooking);
      created = true;
    }

    if (invoice.status === 'draft') {
      invoice = updateInvoice(db, tenantId, invoice.id, { status: 'issued' } as InvoiceUpdateInput);
    }

    const { payment, invoice: after } = recordPayment(db, tenantId, {
      invoice_id: invoice.id,
      kind: 'payment',
      amount_pesewas: input.amount_pesewas,
      method: input.method,
      paid_at: input.paid_at,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
    } as PaymentCreateInput);

    return { invoice: after, payment, created_invoice: created };
  });
  return tx();
}

export function recordPayment(
  db: Database,
  tenantId: string,
  input: PaymentCreateInput,
): { payment: Payment; invoice: InvoiceWithLines } {
  const id = uuidv4();
  const now = nowIso();

  // Validate + insert + status-flip in a single transaction so two concurrent
  // calls cannot both pass the balance check then both insert.
  const tx = db.transaction(() => {
    const snap = readBalance(db, tenantId, input.invoice_id);
    if (!snap) throw new Error('recordPayment: invoice not found');
    if (snap.status === 'void') throw new Error('Cannot record payment on a voided invoice');

    if (input.kind === 'refund') {
      if (input.amount_pesewas > snap.paid) throw new Error('Refund exceeds amount paid');
    } else {
      const projected = snap.paid + input.amount_pesewas;
      if (projected > snap.total) {
        throw new Error(`Payment would exceed total — only ${snap.total - snap.paid} pesewas left`);
      }
    }

    db.prepare(
      `INSERT INTO payments (${PAYMENT_COLS})
       VALUES (@id, @tenant_id, @invoice_id, @kind, @amount_pesewas, @method,
               @reference, @paid_at, @notes, @created_at, @updated_at, NULL)`,
    ).run({
      id,
      tenant_id: tenantId,
      invoice_id: input.invoice_id,
      kind: input.kind,
      amount_pesewas: input.amount_pesewas,
      method: input.method,
      reference: input.reference ?? null,
      paid_at: input.paid_at,
      notes: input.notes ?? null,
      created_at: now,
      updated_at: now,
    });

    const customer_id = getInvoiceCustomerId(db, { booking_id: snap.booking_id });
    if (input.kind === 'deposit') {
      postOnce(db, tenantId, buildDepositReceivedEntry({
        entry_date: toEntryDate(input.paid_at),
        payment_id: id,
        invoice_is_draft: snap.status === 'draft',
        cash_account_id: resolveCashAccount(db, tenantId, input.method),
        customer_deposits_account_id: resolveAccount(db, tenantId, 'customer_deposits'),
        ar_account_id: resolveAccount(db, tenantId, 'ar'),
        amount_pesewas: input.amount_pesewas,
        customer_id,
      }));
    } else if (input.kind === 'payment') {
      postOnce(db, tenantId, buildPaymentReceivedEntry({
        entry_date: toEntryDate(input.paid_at),
        payment_id: id,
        cash_account_id: resolveCashAccount(db, tenantId, input.method),
        ar_account_id: resolveAccount(db, tenantId, 'ar'),
        amount_pesewas: input.amount_pesewas,
        customer_id,
      }));
    } else {
      postOnce(db, tenantId, buildRefundedEntry({
        entry_date: toEntryDate(input.paid_at),
        payment_id: id,
        invoice_is_draft: snap.status === 'draft',
        cash_account_id: resolveCashAccount(db, tenantId, input.method),
        ar_account_id: resolveAccount(db, tenantId, 'ar'),
        customer_deposits_account_id: resolveAccount(db, tenantId, 'customer_deposits'),
        amount_pesewas: input.amount_pesewas,
        customer_id,
      }));
    }

    // Atomic status reconciliation inside the same transaction.
    const after = readBalance(db, tenantId, input.invoice_id);
    if (!after) return;
    const balance = after.total - after.paid;
    if (balance === 0 && after.status === 'issued') {
      db.prepare(
        `UPDATE invoices SET status = 'paid', updated_at = @t WHERE id = @id AND tenant_id = @tenant_id`,
      ).run({ id: input.invoice_id, tenant_id: tenantId, t: now });
    } else if (balance > 0 && after.status === 'paid') {
      db.prepare(
        `UPDATE invoices SET status = 'issued', updated_at = @t WHERE id = @id AND tenant_id = @tenant_id`,
      ).run({ id: input.invoice_id, tenant_id: tenantId, t: now });
    }
  });
  tx();

  const refreshed = getInvoice(db, tenantId, input.invoice_id);
  if (!refreshed) throw new Error('recordPayment: readback failed');
  const payment = refreshed.payments[refreshed.payments.length - 1];
  if (!payment) throw new Error('recordPayment: missing inserted payment');
  return { payment, invoice: refreshed };
}

export function voidPayment(
  db: Database,
  tenantId: string,
  paymentId: string,
): InvoiceWithLines {
  let invoiceId = '';
  const tx = db.transaction(() => {
    const row = db
      .prepare(`SELECT invoice_id, kind FROM payments WHERE id = @id AND tenant_id = @tenant_id AND deleted_at IS NULL`)
      .get({ id: paymentId, tenant_id: tenantId }) as { invoice_id: string; kind: string } | undefined;
    if (!row) throw new Error('voidPayment: payment not found');
    invoiceId = row.invoice_id;

    // Issuing an invoice posts a second, linked entry that moves every deposit
    // held against it out of Customer Deposits Held and into receivables. The
    // reversal below only ever finds the entry filed against the payment
    // itself, so voiding an already-applied deposit left that transfer
    // standing: the deposit liability went negative and A/R was understated by
    // the same amount. Refund it instead, exactly as voiding a paid invoice
    // requires.
    if (row.kind === 'deposit') {
      const applied = db
        .prepare(
          `SELECT id FROM journal_entries
           WHERE tenant_id = @tenant_id AND source_type = 'invoice' AND source_id = @invoice_id
             AND source_event = 'deposit_applied' AND reversed_by_id IS NULL
           LIMIT 1`,
        )
        .get({ tenant_id: tenantId, invoice_id: row.invoice_id }) as { id: string } | undefined;
      if (applied) {
        throw new Error(
          'This deposit has already been applied to an issued invoice. Record a refund against the invoice instead of voiding the deposit.',
        );
      }
    }
    const t = nowIso();
    const entry = db
      .prepare(
        `SELECT id FROM journal_entries
         WHERE tenant_id = @tenant_id AND source_type = 'payment' AND source_id = @payment_id
           AND reversed_by_id IS NULL
         ORDER BY entry_no ASC
         LIMIT 1`,
      )
      .get({ tenant_id: tenantId, payment_id: paymentId }) as { id: string } | undefined;
    if (entry) reverseEntry(db, tenantId, entry.id, toEntryDate(t), 'Payment voided');
    db.prepare(`UPDATE payments SET deleted_at = @t, updated_at = @t WHERE id = @id`).run({
      id: paymentId,
      t,
    });
    const after = readBalance(db, tenantId, invoiceId);
    if (after && after.status === 'paid' && after.total - after.paid > 0) {
      db.prepare(
        `UPDATE invoices SET status = 'issued', updated_at = @t WHERE id = @id AND tenant_id = @tenant_id`,
      ).run({ id: invoiceId, tenant_id: tenantId, t });
    }
  });
  tx();
  const after = getInvoice(db, tenantId, invoiceId);
  if (!after) throw new Error('voidPayment: readback failed');
  return after;
}
