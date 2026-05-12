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

const INVOICE_COLS = `id, tenant_id, booking_id, number, status, issued_at, due_at,
  subtotal_pesewas, tax_pesewas, discount_pesewas, total_pesewas,
  notes, created_at, updated_at, deleted_at`;

const LINE_COLS = `id, tenant_id, invoice_id, booking_line_id, description,
  quantity, days, unit_price_pesewas, line_total_pesewas, sort_order,
  created_at, updated_at, deleted_at`;

const PAYMENT_COLS = `id, tenant_id, invoice_id, kind, amount_pesewas, method,
  reference, paid_at, notes, created_at, updated_at, deleted_at`;

function nowIso(): string { return new Date().toISOString(); }

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
  const rows = db.prepare(sql).all(params) as Array<Invoice & { customer_name: string; amount_paid_pesewas: number }>;
  return rows.map((r) => ({ ...r, balance_due_pesewas: r.total_pesewas - r.amount_paid_pesewas }));
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
    | (Invoice & { customer_name: string; booking_starts_at: string; booking_ends_at: string })
    | undefined;
  if (!row) return null;
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
    ...row,
    lines,
    payments,
    amount_paid_pesewas,
    balance_due_pesewas: row.total_pesewas - amount_paid_pesewas,
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
export function createInvoiceFromBooking(
  db: Database,
  tenantId: string,
  input: InvoiceCreateFromBooking,
): InvoiceWithLines {
  const booking = db
    .prepare(
      `SELECT id, starts_at, ends_at, customer_id FROM bookings
       WHERE id = @id AND tenant_id = @tenant_id AND deleted_at IS NULL`,
    )
    .get({ id: input.booking_id, tenant_id: tenantId }) as
    | { id: string; starts_at: string; ends_at: string; customer_id: string | null }
    | undefined;
  if (!booking) throw new Error('createInvoiceFromBooking: booking not found');

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

  if (blines.length === 0) throw new Error('createInvoiceFromBooking: booking has no lines');

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

  const tax = input.tax_pesewas ?? 0;
  const discount = input.discount_pesewas ?? 0;
  const total = Math.max(0, subtotal + tax - discount);

  const id = uuidv4();
  const now = nowIso();

  const insertInvoice = db.prepare(
    `INSERT INTO invoices (${INVOICE_COLS})
     VALUES (@id, @tenant_id, @booking_id, @number, 'draft', NULL, @due_at,
             @subtotal_pesewas, @tax_pesewas, @discount_pesewas, @total_pesewas,
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
      tax_pesewas: tax,
      discount_pesewas: discount,
      total_pesewas: total,
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

  // Status moves with side-effects.
  let issued_at = existing.issued_at;
  if (patch.status && patch.status !== existing.status) {
    if (patch.status === 'issued' && !issued_at) issued_at = nowIso();
    if (patch.status === 'paid' && existing.balance_due_pesewas > 0) {
      throw new Error('Cannot mark paid: balance is still outstanding');
    }
  }

  const tax = patch.tax_pesewas ?? existing.tax_pesewas;
  const discount = patch.discount_pesewas ?? existing.discount_pesewas;
  const total = Math.max(0, existing.subtotal_pesewas + tax - discount);

  db.prepare(
    `UPDATE invoices SET
       status = @status, issued_at = @issued_at, due_at = @due_at,
       tax_pesewas = @tax_pesewas, discount_pesewas = @discount_pesewas,
       total_pesewas = @total_pesewas, notes = @notes, updated_at = @updated_at
     WHERE id = @id AND tenant_id = @tenant_id`,
  ).run({
    id,
    tenant_id: tenantId,
    status: patch.status ?? existing.status,
    issued_at,
    due_at: patch.due_at ?? existing.due_at,
    tax_pesewas: tax,
    discount_pesewas: discount,
    total_pesewas: total,
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
    updated_at: nowIso(),
  });
  const after = getInvoice(db, tenantId, id);
  if (!after) throw new Error('updateInvoice: readback failed');
  return after;
}

export function softDeleteInvoice(db: Database, tenantId: string, id: string): void {
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
): { total: number; paid: number; status: string } | null {
  return (
    (db
      .prepare(
        `SELECT i.total_pesewas AS total, i.status AS status,
                COALESCE((
                  SELECT SUM(CASE WHEN p.kind = 'refund' THEN -p.amount_pesewas ELSE p.amount_pesewas END)
                  FROM payments p
                  WHERE p.invoice_id = i.id AND p.deleted_at IS NULL
                ), 0) AS paid
         FROM invoices i
         WHERE i.id = @id AND i.tenant_id = @tenant_id AND i.deleted_at IS NULL`,
      )
      .get({ id: invoiceId, tenant_id: tenantId }) as
      | { total: number; paid: number; status: string }
      | undefined) ?? null
  );
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
      .prepare(`SELECT invoice_id FROM payments WHERE id = @id AND tenant_id = @tenant_id AND deleted_at IS NULL`)
      .get({ id: paymentId, tenant_id: tenantId }) as { invoice_id: string } | undefined;
    if (!row) throw new Error('voidPayment: payment not found');
    invoiceId = row.invoice_id;
    const t = nowIso();
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
