import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureChartOfAccounts } from '../accounting/chart';
import { arTiesToSubLedger } from '../accounting/health';
import { createInvoiceFromBooking, recordPayment, updateInvoice } from './invoices';
import { createReturn } from './returns';
import { arAging, balanceSheet, profitAndLoss, trialBalance } from './accounting-reports';

const MIGRATIONS = join(__dirname, '..', '..', '..', '..', '..', 'packages', 'db', 'sqlite', 'migrations');
const TENANT = '00000000-0000-4000-8000-000000000001';
const CUSTOMER = '10000000-0000-4000-8000-000000000001';
const ITEM = '20000000-0000-4000-8000-000000000001';
const UNIT = '30000000-0000-4000-8000-000000000001';
const BOOKING = '40000000-0000-4000-8000-000000000001';
const BOOKING_LINE = '50000000-0000-4000-8000-000000000001';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  // Apply every shipped migration in order, exactly as the real runner does.
  // A hardcoded list here silently pins tests to an old schema the moment a
  // migration lands.
  for (const file of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  }
  const now = '2026-01-01T00:00:00.000Z';
  db.prepare(`INSERT INTO tenants (id, name, currency, locale, created_at, updated_at)
    VALUES (?, 'Donkor and Sons', 'GHS', 'en-GB', ?, ?)`).run(TENANT, now, now);
  ensureChartOfAccounts(db, TENANT);
  db.prepare(`INSERT INTO customers (id, tenant_id, name, phone, email, id_type, id_number, address, notes, created_at, updated_at, deleted_at)
    VALUES (?, ?, 'Ama Donkor', NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, NULL)`).run(CUSTOMER, TENANT, now, now);
  db.prepare(`INSERT INTO items (id, tenant_id, kind, sku, name, description, daily_rate_pesewas, replacement_value_pesewas, total_quantity, status, created_at, updated_at, deleted_at)
    VALUES (?, ?, 'party_supply', 'CHAIR', 'Chair', NULL, 10000, 10000, 50, 'active', ?, ?, NULL)`).run(ITEM, TENANT, now, now);
  db.prepare(`INSERT INTO item_units (id, tenant_id, item_id, identifier, plate, current_status, notes, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, 'CHAIR-001', NULL, 'available', NULL, ?, ?, NULL)`).run(UNIT, TENANT, ITEM, now, now);
  db.prepare(`INSERT INTO bookings (id, tenant_id, customer_id, renter_name, status, starts_at, ends_at, pickup_location, dropoff_location, driver_name, notes, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, NULL, 'out', '2026-02-01T00:00:00.000Z', '2026-02-03T00:00:00.000Z', NULL, NULL, NULL, NULL, ?, ?, NULL)`).run(BOOKING, TENANT, CUSTOMER, now, now);
  db.prepare(`INSERT INTO booking_lines (id, tenant_id, booking_id, item_id, item_unit_id, quantity, daily_rate_pesewas, odometer_start_km, odometer_end_km, fuel_litres_start, fuel_litres_end, notes, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, 1, 10000, NULL, NULL, NULL, NULL, NULL, ?, ?, NULL)`).run(BOOKING_LINE, TENANT, BOOKING, ITEM, UNIT, now, now);
  return db;
}

describe('accounting reports', () => {
  it('keeps trial balance and balance sheet in balance across the posted business flow', () => {
    const db = makeDb();
    const invoice = createInvoiceFromBooking(db, TENANT, {
      booking_id: BOOKING,
      due_at: '2026-02-10T00:00:00.000Z',
      include_statutory_taxes: false,
      discount_pesewas: 1000,
    });
    const issued = updateInvoice(db, TENANT, invoice.id, { status: 'issued' });
    recordPayment(db, TENANT, { invoice_id: issued.id, kind: 'deposit', amount_pesewas: 5000, method: 'cash', paid_at: '2026-02-02T00:00:00.000Z', reference: null, notes: null });
    recordPayment(db, TENANT, { invoice_id: issued.id, kind: 'payment', amount_pesewas: 14000, method: 'cash', paid_at: '2026-02-18T00:00:00.000Z', reference: null, notes: null });
    const ret = createReturn(db, TENANT, {
      booking_id: BOOKING,
      returned_at: '2026-02-20T00:00:00.000Z',
      deposit_pesewas: 5000,
      lines: [{ booking_line_id: BOOKING_LINE, item_id: ITEM, item_unit_id: UNIT, condition: 'damaged', severity: 'minor', quantity: 1, description: 'Scratch', charge_pesewas: 2000, write_off: false }],
    });
    expect(ret.refund_pesewas).toBe(3000);
    recordPayment(db, TENANT, { invoice_id: issued.id, kind: 'refund', amount_pesewas: 3000, method: 'cash', paid_at: '2026-02-21T00:00:00.000Z', reference: null, notes: null });

    const tb = trialBalance(db, TENANT, '2026-12-31');
    expect(tb.reduce((s, r) => s + r.debit_pesewas - r.credit_pesewas, 0)).toBe(0);
    const bs = balanceSheet(db, TENANT, '2026-12-31');
    expect(bs.out_of_balance_pesewas).toBe(0);
    const pnl = profitAndLoss(db, TENANT, '2026-01-01', '2026-12-31');
    const pnlNet = pnl.reduce((s, r) => s + (r.account_type === 'income' ? r.amount_pesewas : -r.amount_pesewas), 0);
    expect(pnlNet).toBe(bs.current_net_income_pesewas);
    expect(arTiesToSubLedger(db, TENANT, '2026-12-31').delta_pesewas).toBe(0);
    db.close();
  });

  it('refuses to void an invoice that has been paid', () => {
    const db = makeDb();
    const invoice = createInvoiceFromBooking(db, TENANT, {
      booking_id: BOOKING,
      due_at: '2026-02-10T00:00:00.000Z',
      include_statutory_taxes: false,
    });
    const issued = updateInvoice(db, TENANT, invoice.id, { status: 'issued' });
    recordPayment(db, TENANT, { invoice_id: issued.id, kind: 'payment', amount_pesewas: 5000, method: 'cash', paid_at: '2026-02-18T00:00:00.000Z', reference: null, notes: null });

    // Voiding reverses the issue entry only. The payment credit would survive
    // it, leaving A/R with a credit balance and breaking the tie-out against the
    // invoice sub-ledger.
    expect(() => updateInvoice(db, TENANT, invoice.id, { status: 'void' })).toThrow(/Refund the payments first/);
    db.close();
  });

  it('nets an unpaid voided invoice to zero rather than deleting it', () => {
    const db = makeDb();
    const invoice = createInvoiceFromBooking(db, TENANT, {
      booking_id: BOOKING,
      due_at: '2026-02-10T00:00:00.000Z',
      include_statutory_taxes: false,
    });
    updateInvoice(db, TENANT, invoice.id, { status: 'issued' });
    updateInvoice(db, TENANT, invoice.id, { status: 'void' });

    const tb = trialBalance(db, TENANT, '2026-12-31');
    expect(tb.reduce((sum, r) => sum + r.debit_pesewas - r.credit_pesewas, 0)).toBe(0);
    expect(arTiesToSubLedger(db, TENANT, '2026-12-31').delta_pesewas).toBe(0);
    // The entries remain on the books as an issue plus its reversal.
    const entries = db.prepare(
      "SELECT COUNT(*) AS n FROM journal_entries WHERE tenant_id = ? AND source_type = 'invoice'",
    ).get(TENANT) as { n: number };
    expect(entries.n).toBeGreaterThanOrEqual(2);
    db.close();
  });

  it('includes an invoice paid today in an earlier as-of ageing snapshot', () => {
    const db = makeDb();
    const invoice = createInvoiceFromBooking(db, TENANT, {
      booking_id: BOOKING,
      due_at: '2026-02-10T00:00:00.000Z',
      include_statutory_taxes: false,
    });
    const issued = updateInvoice(db, TENANT, invoice.id, { status: 'issued' });
    // updateInvoice stamps issued_at with "now", so backdate it: the point of
    // this test is a snapshot taken between issue and payment.
    db.prepare('UPDATE invoices SET issued_at = ? WHERE id = ?').run('2026-02-01T00:00:00.000Z', issued.id);
    recordPayment(db, TENANT, { invoice_id: issued.id, kind: 'payment', amount_pesewas: issued.total_pesewas, method: 'cash', paid_at: '2026-02-18T00:00:00.000Z', reference: null, notes: null });
    expect(arAging(db, TENANT, '2026-02-12')).toEqual([
      expect.objectContaining({ invoice_id: invoice.id, balance_pesewas: issued.total_pesewas }),
    ]);
    db.close();
  });

  it('buckets by how overdue the invoice actually is', () => {
    // Regression: due_at holds a full ISO datetime, and only the issued_at
    // fallback was sliced to a date. The concatenation built
    // "2026-02-10T17:00:00.000ZT00:00:00Z", which parses to NaN — and since
    // every comparison against NaN is false, agingBucket fell through to
    // "90+". Every open invoice read as more than 90 days overdue, so the whole
    // report was useless. The old assertion above could not catch it: it never
    // looked at days_overdue or bucket.
    const db = makeDb();
    const invoice = createInvoiceFromBooking(db, TENANT, {
      booking_id: BOOKING,
      due_at: '2026-02-10T17:00:00.000Z',
      include_statutory_taxes: false,
    } as Parameters<typeof createInvoiceFromBooking>[2]);
    updateInvoice(db, TENANT, invoice.id, { status: 'issued' } as Parameters<typeof updateInvoice>[3]);
    db.prepare('UPDATE invoices SET issued_at = ? WHERE id = ?').run('2026-02-01T00:00:00.000Z', invoice.id);

    const notYetDue = arAging(db, TENANT, '2026-02-05')[0];
    expect(notYetDue.days_overdue).toBe(-5);
    expect(notYetDue.bucket).toBe('current');

    const twoWeeksLate = arAging(db, TENANT, '2026-02-24')[0];
    expect(twoWeeksLate.days_overdue).toBe(14);
    expect(twoWeeksLate.bucket).toBe('d1_30');

    const veryLate = arAging(db, TENANT, '2026-06-01')[0];
    expect(veryLate.days_overdue).toBe(111);
    expect(veryLate.bucket).toBe('d90_plus');
    db.close();
  });
});
