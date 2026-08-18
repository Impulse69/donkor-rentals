import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ensureChartOfAccounts, resolveAccount } from './chart';
import { postOnce } from './posting';
import { createBooking } from '../repositories/bookings';
import { createInvoiceFromBooking, recordPayment, updateInvoice } from '../repositories/invoices';

/**
 * Two invariants whose failure mode is silence.
 *
 * The period lock is an accounting control: if it does not actually reject a
 * backdated entry, "closing the books" is decorative and a prior period keeps
 * moving underneath a filed return.
 *
 * Atomicity is the one that matters most. Posting runs inside the same
 * transaction as the business write, so if posting fails the business write must
 * disappear with it. If it does not, you get an invoice or a payment with no
 * ledger entry — the records and the books diverge with nothing to indicate it.
 */
const MIGRATIONS = join(__dirname, '..', '..', '..', '..', '..', 'packages', 'db', 'sqlite', 'migrations');
const TENANT = '00000000-0000-4000-8000-000000000001';
const ITEM = 'item-chairs';

let db: Database.Database;

function makeDb(): Database.Database {
  const d = new Database(':memory:');
  d.pragma('foreign_keys = ON');
  for (const f of ['0001_baseline.sql', '0002_accounting.sql']) {
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
     VALUES (?, ?, 'party_supply', 'CHAIR', 'Chairs', 1000, 5000, 100, 'active', ?, ?)`,
  ).run(ITEM, TENANT, now, now);
  ensureChartOfAccounts(d, TENANT);
  return d;
}

function makeBooking(): string {
  return createBooking(db, TENANT, {
    customer_id: null,
    renter_name: 'Walk-in',
    starts_at: '2026-03-01T00:00:00.000Z',
    ends_at: '2026-03-05T00:00:00.000Z',
    pickup_location: null,
    dropoff_location: null,
    driver_name: null,
    notes: null,
    lines: [{ item_id: ITEM, item_unit_id: null, quantity: 10, daily_rate_pesewas: 1_000, notes: null }],
  } as Parameters<typeof createBooking>[2]).id;
}

function simpleEntry(entryDate: string, sourceId: string) {
  return {
    entry_date: entryDate,
    memo: 'test',
    origin: 'manual',
    source_type: 'manual',
    source_id: sourceId,
    source_event: 'manual',
    lines: [
      { account_id: resolveAccount(db, TENANT, 'ar'), debit_pesewas: 1_000, credit_pesewas: 0 },
      { account_id: resolveAccount(db, TENANT, 'cash.cash'), debit_pesewas: 0, credit_pesewas: 1_000 },
    ],
  } as Parameters<typeof postOnce>[2];
}

function closeBooksThrough(date: string): void {
  db.prepare('UPDATE accounting_settings SET books_closed_through = ? WHERE tenant_id = ?').run(date, TENANT);
}

function countRows(table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE tenant_id = ?`).get(TENANT) as { n: number }).n;
}

beforeEach(() => {
  db = makeDb();
});

describe('period lock', () => {
  it('accepts entries when the books are open', () => {
    expect(postOnce(db, TENANT, simpleEntry('2026-03-01', 'e1'))).toBeTruthy();
  });

  it('rejects an entry dated inside a closed period', () => {
    closeBooksThrough('2026-03-31');
    expect(() => postOnce(db, TENANT, simpleEntry('2026-03-15', 'e1'))).toThrow();
    expect(countRows('journal_entries')).toBe(0);
  });

  it('rejects an entry dated exactly on the closing date', () => {
    // The boundary is the whole point of a lock: the closing date itself is
    // inside the closed period, not the first open day.
    closeBooksThrough('2026-03-31');
    expect(() => postOnce(db, TENANT, simpleEntry('2026-03-31', 'e1'))).toThrow();
  });

  it('accepts the first day after the closing date', () => {
    closeBooksThrough('2026-03-31');
    expect(postOnce(db, TENANT, simpleEntry('2026-04-01', 'e1'))).toBeTruthy();
  });

  it('applies to automated postings, not just manual entries', () => {
    // A payment recorded into a closed period must fail the business operation
    // too — otherwise cash moves with no matching entry.
    closeBooksThrough('2026-12-31');
    const bookingId = makeBooking();
    const invoice = createInvoiceFromBooking(db, TENANT, {
      booking_id: bookingId,
      due_at: '2026-03-10T00:00:00.000Z',
      include_statutory_taxes: false,
    } as Parameters<typeof createInvoiceFromBooking>[2]);

    expect(() => updateInvoice(db, TENANT, invoice.id, { status: 'issued' } as Parameters<typeof updateInvoice>[3]))
      .toThrow();
  });
});

describe('atomicity of business write and posting', () => {
  it('rolls the invoice back when its posting is refused', () => {
    closeBooksThrough('2026-12-31');
    const bookingId = makeBooking();
    const invoice = createInvoiceFromBooking(db, TENANT, {
      booking_id: bookingId,
      due_at: '2026-03-10T00:00:00.000Z',
      include_statutory_taxes: false,
    } as Parameters<typeof createInvoiceFromBooking>[2]);

    const statusBefore = (db.prepare('SELECT status FROM invoices WHERE id = ?').get(invoice.id) as { status: string }).status;
    expect(() => updateInvoice(db, TENANT, invoice.id, { status: 'issued' } as Parameters<typeof updateInvoice>[3])).toThrow();

    // The invoice must still be a draft. A persisted "issued" invoice with no
    // journal entry is the divergence this transaction exists to prevent.
    const statusAfter = (db.prepare('SELECT status FROM invoices WHERE id = ?').get(invoice.id) as { status: string }).status;
    expect(statusAfter).toBe(statusBefore);
    expect(statusAfter).toBe('draft');
    expect(countRows('journal_entries')).toBe(0);
  });

  it('rolls the payment back when its posting is refused', () => {
    const bookingId = makeBooking();
    const invoice = createInvoiceFromBooking(db, TENANT, {
      booking_id: bookingId,
      due_at: '2026-03-10T00:00:00.000Z',
      include_statutory_taxes: false,
    } as Parameters<typeof createInvoiceFromBooking>[2]);
    const issued = updateInvoice(db, TENANT, invoice.id, { status: 'issued' } as Parameters<typeof updateInvoice>[3]);

    const paymentsBefore = countRows('payments');
    closeBooksThrough('2026-12-31');

    expect(() => recordPayment(db, TENANT, {
      invoice_id: issued.id,
      kind: 'payment',
      amount_pesewas: 5_000,
      method: 'cash',
      paid_at: '2026-03-20T00:00:00.000Z',
      reference: null,
      notes: null,
    } as Parameters<typeof recordPayment>[2])).toThrow();

    // No orphan payment row: cash that the ledger never saw would overstate
    // what the customer has settled.
    expect(countRows('payments')).toBe(paymentsBefore);
  });

  it('leaves the ledger balanced after a refused write', () => {
    closeBooksThrough('2026-12-31');
    const bookingId = makeBooking();
    const invoice = createInvoiceFromBooking(db, TENANT, {
      booking_id: bookingId,
      due_at: '2026-03-10T00:00:00.000Z',
      include_statutory_taxes: false,
    } as Parameters<typeof createInvoiceFromBooking>[2]);
    expect(() => updateInvoice(db, TENANT, invoice.id, { status: 'issued' } as Parameters<typeof updateInvoice>[3])).toThrow();

    const sums = db
      .prepare(
        `SELECT COALESCE(SUM(debit_pesewas),0) AS d, COALESCE(SUM(credit_pesewas),0) AS c
         FROM journal_lines WHERE tenant_id = ?`,
      )
      .get(TENANT) as { d: number; c: number };
    expect(sums.d).toBe(sums.c);
  });
});
