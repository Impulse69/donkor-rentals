import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ensureChartOfAccounts, resolveAccount } from '../accounting/chart';
import { createBooking } from './bookings';
import { createReturn, getReturn, listReturns } from './returns';

/**
 * Check-in is where a rental turns into money: the security deposit is
 * reconciled against damage, the unit's condition is recorded, the booking
 * closes, and the ledger is posted — all in one transaction. reconcileDeposit
 * itself is tested in packages/shared; what was untested is this wiring, which
 * is where the side effects live.
 */
const MIGRATIONS = join(__dirname, '..', '..', '..', '..', '..', 'packages', 'db', 'sqlite', 'migrations');
const TENANT = '00000000-0000-4000-8000-000000000001';
const ITEM = 'item-hearse';
const UNIT = 'unit-a';

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
     VALUES (?, ?, 'hearse', 'HRS', 'Hearse', 1000, 90000, 2, 'active', ?, ?)`,
  ).run(ITEM, TENANT, now, now);
  d.prepare(
    `INSERT INTO item_units (id, tenant_id, item_id, identifier, current_status, created_at, updated_at)
     VALUES (?, ?, ?, 'GR-1111', 'available', ?, ?)`,
  ).run(UNIT, TENANT, ITEM, now, now);
  ensureChartOfAccounts(d, TENANT);
  return d;
}

function makeBooking(): { bookingId: string; lineId: string } {
  const created = createBooking(db, TENANT, {
    customer_id: null,
    renter_name: 'Walk-in',
    starts_at: '2026-03-01T00:00:00.000Z',
    ends_at: '2026-03-05T00:00:00.000Z',
    pickup_location: null,
    dropoff_location: null,
    driver_name: null,
    notes: null,
    lines: [{ item_id: ITEM, item_unit_id: UNIT, quantity: 1, daily_rate_pesewas: 1000, notes: null }],
  } as Parameters<typeof createBooking>[2]);
  const line = db
    .prepare('SELECT id FROM booking_lines WHERE booking_id = ?')
    .get(created.id) as { id: string };
  return { bookingId: created.id, lineId: line.id };
}

function recordReturn(opts: {
  bookingId: string;
  lineId: string;
  depositPesewas: number;
  chargePesewas: number;
  condition?: 'good' | 'damaged' | 'lost';
  writeOff?: boolean;
}) {
  return createReturn(db, TENANT, {
    booking_id: opts.bookingId,
    returned_at: '2026-03-05T00:00:00.000Z',
    received_by: 'Yaw',
    notes: null,
    deposit_pesewas: opts.depositPesewas,
    lines: [{
      booking_line_id: opts.lineId,
      item_id: ITEM,
      item_unit_id: UNIT,
      condition: opts.condition ?? 'damaged',
      severity: 'minor',
      quantity: 1,
      description: 'Scratch',
      charge_pesewas: opts.chargePesewas,
      write_off: opts.writeOff ?? false,
    }],
  } as Parameters<typeof createReturn>[2]);
}

function unitStatus(): string {
  return (db.prepare('SELECT current_status FROM item_units WHERE id = ?').get(UNIT) as { current_status: string }).current_status;
}

function ledger() {
  return db
    .prepare(
      `SELECT COALESCE(SUM(debit_pesewas),0) AS debits, COALESCE(SUM(credit_pesewas),0) AS credits
       FROM journal_lines WHERE tenant_id = ?`,
    )
    .get(TENANT) as { debits: number; credits: number };
}

beforeEach(() => {
  db = makeDb();
});

describe('deposit reconciliation', () => {
  it('refunds the remainder when damage costs less than the deposit', () => {
    const { bookingId, lineId } = makeBooking();
    const ret = recordReturn({ bookingId, lineId, depositPesewas: 5_000, chargePesewas: 2_000 });

    expect(ret.total_charges_pesewas).toBe(2_000);
    expect(ret.refund_pesewas).toBe(3_000);
    expect(ret.balance_due_pesewas).toBe(0);
  });

  it('bills the excess when damage costs more than the deposit', () => {
    const { bookingId, lineId } = makeBooking();
    const ret = recordReturn({ bookingId, lineId, depositPesewas: 5_000, chargePesewas: 8_000 });

    expect(ret.refund_pesewas).toBe(0);
    expect(ret.balance_due_pesewas).toBe(3_000);
  });

  it('refunds the whole deposit when nothing is damaged', () => {
    const { bookingId, lineId } = makeBooking();
    const ret = recordReturn({ bookingId, lineId, depositPesewas: 5_000, chargePesewas: 0, condition: 'good' });

    expect(ret.total_charges_pesewas).toBe(0);
    expect(ret.refund_pesewas).toBe(5_000);
  });

  it('handles a return with no deposit held at all', () => {
    const { bookingId, lineId } = makeBooking();
    const ret = recordReturn({ bookingId, lineId, depositPesewas: 0, chargePesewas: 2_000 });

    expect(ret.refund_pesewas).toBe(0);
    expect(ret.balance_due_pesewas).toBe(2_000);
  });
});

describe('side effects', () => {
  it('closes the booking', () => {
    const { bookingId, lineId } = makeBooking();
    recordReturn({ bookingId, lineId, depositPesewas: 5_000, chargePesewas: 1_000 });

    const status = (db.prepare('SELECT status FROM bookings WHERE id = ?').get(bookingId) as { status: string }).status;
    expect(status).toBe('returned');
  });

  it('marks a damaged unit damaged, and a written-off or lost unit retired', () => {
    const first = makeBooking();
    recordReturn({ bookingId: first.bookingId, lineId: first.lineId, depositPesewas: 5_000, chargePesewas: 1_000, condition: 'damaged' });
    expect(unitStatus()).toBe('damaged');

    db.prepare("UPDATE item_units SET current_status = 'available' WHERE id = ?").run(UNIT);
    const second = makeBooking();
    recordReturn({ bookingId: second.bookingId, lineId: second.lineId, depositPesewas: 5_000, chargePesewas: 90_000, condition: 'lost' });
    expect(unitStatus()).toBe('retired');
  });

  it('refuses a second return for the same booking', () => {
    const { bookingId, lineId } = makeBooking();
    recordReturn({ bookingId, lineId, depositPesewas: 5_000, chargePesewas: 1_000 });

    expect(() => recordReturn({ bookingId, lineId, depositPesewas: 5_000, chargePesewas: 1_000 }))
      .toThrow(/already been recorded/i);
  });

  it('refuses a return against a booking that does not exist', () => {
    const { lineId } = makeBooking();
    expect(() => recordReturn({ bookingId: 'nope', lineId, depositPesewas: 0, chargePesewas: 0 }))
      .toThrow(/booking not found/i);
  });
});

describe('ledger posting', () => {
  it('posts a balanced entry crediting damage recovery', () => {
    const { bookingId, lineId } = makeBooking();
    recordReturn({ bookingId, lineId, depositPesewas: 5_000, chargePesewas: 2_000 });

    const sums = ledger();
    expect(sums.debits).toBe(sums.credits);
    expect(sums.debits).toBeGreaterThan(0);

    const income = resolveAccount(db, TENANT, 'income.damage_recovery');
    const credited = db
      .prepare('SELECT COALESCE(SUM(credit_pesewas),0) AS n FROM journal_lines WHERE account_id = ?')
      .get(income) as { n: number };
    expect(credited.n).toBe(2_000);
  });

  it('splits charges above the deposit between the liability and A/R', () => {
    const { bookingId, lineId } = makeBooking();
    recordReturn({ bookingId, lineId, depositPesewas: 5_000, chargePesewas: 8_000 });

    const deposits = resolveAccount(db, TENANT, 'customer_deposits');
    const ar = resolveAccount(db, TENANT, 'ar');
    const debitOn = (account: string): number =>
      (db.prepare('SELECT COALESCE(SUM(debit_pesewas),0) AS n FROM journal_lines WHERE account_id = ?').get(account) as { n: number }).n;

    // Deposit absorbs what it can; the rest becomes receivable.
    expect(debitOn(deposits)).toBe(5_000);
    expect(debitOn(ar)).toBe(3_000);
    expect(ledger().debits).toBe(ledger().credits);
  });

  it('posts nothing when there are no charges to recover', () => {
    const { bookingId, lineId } = makeBooking();
    recordReturn({ bookingId, lineId, depositPesewas: 5_000, chargePesewas: 0, condition: 'good' });

    // A zero-value event should not manufacture an empty journal entry.
    expect(ledger().debits).toBe(0);
    expect(ledger().credits).toBe(0);
  });
});

describe('reads', () => {
  it('returns the record with its damage lines', () => {
    const { bookingId, lineId } = makeBooking();
    const created = recordReturn({ bookingId, lineId, depositPesewas: 5_000, chargePesewas: 2_000 });

    const fetched = getReturn(db, TENANT, created.id);
    expect(fetched?.lines).toHaveLength(1);
    expect(fetched?.lines[0].charge_pesewas).toBe(2_000);
  });

  it('lists returns with a customer name, falling back for walk-ins', () => {
    const { bookingId, lineId } = makeBooking();
    recordReturn({ bookingId, lineId, depositPesewas: 5_000, chargePesewas: 2_000 });

    const rows = listReturns(db, TENANT);
    expect(rows).toHaveLength(1);
    expect(rows[0].customer_name).toBeTruthy();
  });
});
