import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ensureChartOfAccounts, resolveAccount } from '../accounting/chart';
import { arTiesToSubLedger, everyEntryBalances, unpostedEvents } from '../accounting/health';
import { createBooking } from './bookings';
import {
  createInvoiceFromBooking,
  previewInvoiceForBooking,
  takePaymentForBooking,
  updateInvoice,
} from './invoices';

/**
 * Taking payment straight from a booking — the walk-in who pays at the counter
 * and wants a receipt, not an invoice.
 *
 * The paperwork still has to exist underneath, because the invoice is what
 * posts the sale to income. What these pin down is that raising it silently
 * produces exactly the same books as walking through the invoice screen by
 * hand, and that it never quietly raises a second invoice for a booking that
 * already has one.
 */
const MIGRATIONS = join(__dirname, '..', '..', '..', '..', '..', 'packages', 'db', 'sqlite', 'migrations');
const TENANT = '00000000-0000-4000-8000-000000000001';
const CHAIRS = 'item-chairs';

let db: Database.Database;

function makeDb(): Database.Database {
  const d = new Database(':memory:');
  d.pragma('foreign_keys = ON');
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
    d.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  }
  const now = new Date().toISOString();
  d.prepare(
    `INSERT INTO tenants (id, name, currency, locale, created_at, updated_at)
     VALUES (?, 'Donkor', 'GHS', 'en-GB', ?, ?)`,
  ).run(TENANT, now, now);
  d.prepare(
    `INSERT INTO items (id, tenant_id, kind, sku, name, daily_rate_pesewas,
      replacement_value_pesewas, total_quantity, status, created_at, updated_at)
     VALUES (?, ?, 'party_supply', 'CHAIR', 'Chairs', 1000, 5000, 500, 'active', ?, ?)`,
  ).run(CHAIRS, TENANT, now, now);
  ensureChartOfAccounts(d, TENANT);
  return d;
}

function booking(status: 'quote' | 'out' | 'cancelled' = 'out'): string {
  const created = createBooking(db, TENANT, {
    customer_id: null,
    renter_name: 'Walk-in',
    renter_phone: null,
    starts_at: '2026-03-01T08:00:00.000Z',
    ends_at: '2026-03-03T08:00:00.000Z',
    pickup_location: null,
    dropoff_location: null,
    driver_name: null,
    notes: null,
    lines: [{ item_id: CHAIRS, item_unit_id: null, quantity: 10, daily_rate_pesewas: 1_000, notes: null }],
  } as Parameters<typeof createBooking>[2]);
  if (status !== 'quote') {
    db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, created.id);
  }
  return created.id;
}

function take(bookingId: string, amount: number) {
  return takePaymentForBooking(db, TENANT, {
    booking_id: bookingId,
    amount_pesewas: amount,
    method: 'cash',
    paid_at: '2026-03-01T09:00:00.000Z',
    reference: null,
    notes: null,
  });
}

function totalIncome(): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(jl.credit_pesewas), 0) - COALESCE(SUM(jl.debit_pesewas), 0) AS bal
       FROM journal_lines jl
       JOIN accounts a ON a.id = jl.account_id AND a.tenant_id = jl.tenant_id
       WHERE jl.tenant_id = ? AND a.account_type = 'income'`,
    )
    .get(TENANT) as { bal: number };
  return row.bal;
}

function cashBalance(): number {
  const id = resolveAccount(db, TENANT, 'cash.cash');
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(debit_pesewas),0) - COALESCE(SUM(credit_pesewas),0) AS bal
       FROM journal_lines WHERE tenant_id = ? AND account_id = ?`,
    )
    .get(TENANT, id) as { bal: number };
  return row.bal;
}

function invoiceCount(bookingId: string): number {
  return (db
    .prepare('SELECT COUNT(*) AS n FROM invoices WHERE booking_id = ? AND deleted_at IS NULL')
    .get(bookingId) as { n: number }).n;
}

function expectBooksTie(): void {
  expect(everyEntryBalances(db, TENANT)).toEqual([]);
  expect(unpostedEvents(db, TENANT)).toEqual([]);
  expect(arTiesToSubLedger(db, TENANT, '2026-12-31').delta_pesewas).toBe(0);
}

beforeEach(() => {
  db = makeDb();
});

describe('the quoted total', () => {
  it('is what the invoice would charge, before anything is written', () => {
    const id = booking();
    const preview = previewInvoiceForBooking(db, TENANT, id);
    expect(invoiceCount(id)).toBe(0); // previewing writes nothing

    const invoice = createInvoiceFromBooking(db, TENANT, {
      booking_id: id,
      include_statutory_taxes: true,
    } as Parameters<typeof createInvoiceFromBooking>[2]);

    expect(preview.total_pesewas).toBe(invoice.total_pesewas);
    expect(preview.subtotal_pesewas).toBe(invoice.subtotal_pesewas);
    expect(preview.vat_pesewas).toBe(invoice.vat_pesewas);
  });

  it('is what taking payment actually charges', () => {
    // The figure on the payment sheet and the figure that reaches the ledger
    // have to be the same number, or the receipt is a lie.
    const id = booking();
    const preview = previewInvoiceForBooking(db, TENANT, id);
    const { invoice } = take(id, preview.total_pesewas);

    expect(invoice.total_pesewas).toBe(preview.total_pesewas);
    expect(invoice.balance_due_pesewas).toBe(0);
  });
});

describe('taking payment on a booking with no invoice', () => {
  it('records the sale, the cash and a settled invoice in one go', () => {
    const id = booking();
    const preview = previewInvoiceForBooking(db, TENANT, id);

    const { invoice, payment, created_invoice } = take(id, preview.total_pesewas);

    expect(created_invoice).toBe(true);
    expect(payment.amount_pesewas).toBe(preview.total_pesewas);
    expect(invoice.status).toBe('paid');
    // The invoice was issued on the way through, not left as a draft.
    expect(invoice.issued_at).toBeTruthy();
    expect(cashBalance()).toBe(preview.total_pesewas);
    expect(totalIncome()).toBe(invoice.subtotal_pesewas);
    expectBooksTie();
  });

  it('leaves the books identical to invoicing by hand', () => {
    // Same booking priced both ways must land on the same income and the same
    // total. If these ever diverge, the quick path is quietly a different
    // product.
    const quick = booking();
    take(quick, previewInvoiceForBooking(db, TENANT, quick).total_pesewas);
    const quickIncome = totalIncome();
    const quickCash = cashBalance();

    const dbAfterQuick = totalIncome();
    expect(dbAfterQuick).toBe(quickIncome);

    // Now the long way round on a fresh database.
    db = makeDb();
    const manual = booking();
    const inv = createInvoiceFromBooking(db, TENANT, {
      booking_id: manual,
      include_statutory_taxes: true,
    } as Parameters<typeof createInvoiceFromBooking>[2]);
    updateInvoice(db, TENANT, inv.id, { status: 'issued' } as Parameters<typeof updateInvoice>[3]);
    takePaymentForBooking(db, TENANT, {
      booking_id: manual,
      amount_pesewas: inv.total_pesewas,
      method: 'cash',
      paid_at: '2026-03-01T09:00:00.000Z',
      reference: null,
      notes: null,
    });

    expect(totalIncome()).toBe(quickIncome);
    expect(cashBalance()).toBe(quickCash);
    expectBooksTie();
  });

  it('accepts a part payment and leaves the rest owing', () => {
    const id = booking();
    const preview = previewInvoiceForBooking(db, TENANT, id);
    const { invoice } = take(id, 5_000);

    expect(invoice.status).toBe('issued');
    expect(invoice.balance_due_pesewas).toBe(preview.total_pesewas - 5_000);
    expectBooksTie();
  });
});

describe('taking payment on a booking that already has an invoice', () => {
  it('pays the existing invoice rather than raising a second one', () => {
    const id = booking();
    const existing = createInvoiceFromBooking(db, TENANT, {
      booking_id: id,
      include_statutory_taxes: false,
    } as Parameters<typeof createInvoiceFromBooking>[2]);

    const { invoice, created_invoice } = take(id, existing.total_pesewas);

    expect(created_invoice).toBe(false);
    expect(invoice.id).toBe(existing.id);
    expect(invoiceCount(id)).toBe(1);
    // Its own terms are respected — no statutory tax was silently added.
    expect(invoice.total_pesewas).toBe(existing.total_pesewas);
    expectBooksTie();
  });

  it('issues an existing draft on the way through', () => {
    const id = booking();
    const draft = createInvoiceFromBooking(db, TENANT, {
      booking_id: id,
    } as Parameters<typeof createInvoiceFromBooking>[2]);
    expect(draft.status).toBe('draft');

    const { invoice } = take(id, draft.total_pesewas);
    expect(invoice.status).toBe('paid');
    expectBooksTie();
  });

  it('ignores a voided invoice and raises a fresh one', () => {
    const id = booking();
    const dead = createInvoiceFromBooking(db, TENANT, {
      booking_id: id,
    } as Parameters<typeof createInvoiceFromBooking>[2]);
    updateInvoice(db, TENANT, dead.id, { status: 'void' } as Parameters<typeof updateInvoice>[3]);

    const { invoice, created_invoice } = take(id, previewInvoiceForBooking(db, TENANT, id).total_pesewas);

    expect(created_invoice).toBe(true);
    expect(invoice.id).not.toBe(dead.id);
    expectBooksTie();
  });
});

describe('refusals', () => {
  it('will not take payment for a cancelled booking', () => {
    const id = booking('cancelled');
    expect(() => take(id, 1_000)).toThrow(/cancelled/i);
    expect(invoiceCount(id)).toBe(0);
  });

  it('writes nothing at all when the payment is rejected', () => {
    // The invoice is raised inside the same transaction as the payment, so a
    // refused payment must not leave an invoice behind for a sale that never
    // happened.
    const id = booking();
    const preview = previewInvoiceForBooking(db, TENANT, id);

    expect(() => take(id, preview.total_pesewas + 1)).toThrow();

    expect(invoiceCount(id)).toBe(0);
    expect(totalIncome()).toBe(0);
    expect(cashBalance()).toBe(0);
  });
});
