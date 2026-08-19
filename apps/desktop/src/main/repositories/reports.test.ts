import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { getTopCustomers, getTripLog, getUtilization } from './reports';

/**
 * The Reports screen has always shown a date range for Top Customers and the
 * Trip Log. It was never passed through to the query, so picking "This quarter"
 * returned all-time figures under a heading that said otherwise — wrong in the
 * most quotable way, since these are the numbers repeated to a client.
 */
const MIGRATIONS = join(__dirname, '..', '..', '..', '..', '..', 'packages', 'db', 'sqlite', 'migrations');
const TENANT = '00000000-0000-4000-8000-000000000001';
const HEARSE = 'item-hearse';

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
     VALUES (?, ?, 'hearse', 'HRS', 'Hearse', 50000, 9000000, 2, 'active', ?, ?)`,
  ).run(HEARSE, TENANT, now, now);
  return d;
}

/** The schema insists a booking ends after it starts. */
function endOfSameDay(startsAt: string): string {
  return new Date(Date.parse(startsAt) + 8 * 60 * 60 * 1000).toISOString();
}

/** A customer with one hearse booking, an invoice, and a payment against it. */
function customerWithTrip(name: string, startsAt: string, paidAt: string, amount: number): void {
  const now = new Date().toISOString();
  const cid = `cust-${name}`;
  const bid = `book-${name}`;
  const iid = `inv-${name}`;
  db.prepare(
    `INSERT INTO customers (id, tenant_id, name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(cid, TENANT, name, now, now);
  db.prepare(
    `INSERT INTO bookings (id, tenant_id, customer_id, status, starts_at, ends_at, created_at, updated_at)
     VALUES (?, ?, ?, 'returned', ?, ?, ?, ?)`,
  ).run(bid, TENANT, cid, startsAt, endOfSameDay(startsAt), now, now);
  db.prepare(
    `INSERT INTO booking_lines (id, tenant_id, booking_id, item_id, quantity, daily_rate_pesewas, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, 50000, ?, ?)`,
  ).run(`line-${name}`, TENANT, bid, HEARSE, now, now);
  db.prepare(
    `INSERT INTO invoices (id, tenant_id, booking_id, number, status, subtotal_pesewas,
       tax_pesewas, discount_pesewas, total_pesewas, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'paid', ?, 0, 0, ?, ?, ?)`,
  ).run(iid, TENANT, bid, `INV-${name}`, amount, amount, now, now);
  db.prepare(
    `INSERT INTO payments (id, tenant_id, invoice_id, kind, amount_pesewas, method, paid_at, created_at, updated_at)
     VALUES (?, ?, ?, 'payment', ?, 'cash', ?, ?, ?)`,
  ).run(`pay-${name}`, TENANT, iid, amount, paidAt, now, now);
}

beforeEach(() => {
  db = makeDb();
  customerWithTrip('Ama', '2026-02-10T08:00:00.000Z', '2026-02-10T08:00:00.000Z', 100_000);
  customerWithTrip('Kofi', '2026-08-10T08:00:00.000Z', '2026-08-10T08:00:00.000Z', 50_000);
});

describe('getTopCustomers', () => {
  it('returns everyone when no range is given', () => {
    const all = getTopCustomers(db, TENANT, 10);
    expect(all.map((r) => r.customer_name).sort()).toEqual(['Ama', 'Kofi']);
    expect(all.find((r) => r.customer_name === 'Ama')?.revenue_pesewas).toBe(100_000);
  });

  it('counts only revenue received inside the range', () => {
    const q3 = getTopCustomers(db, TENANT, 10, '2026-07-01', '2026-09-30');
    const kofi = q3.find((r) => r.customer_name === 'Kofi');
    const ama = q3.find((r) => r.customer_name === 'Ama');

    expect(kofi?.revenue_pesewas).toBe(50_000);
    expect(kofi?.bookings).toBe(1);
    // Ama's money arrived in February, so she contributes nothing to Q3.
    expect(ama?.revenue_pesewas ?? 0).toBe(0);
    expect(ama?.bookings ?? 0).toBe(0);
  });

  it('reports the other period just as faithfully', () => {
    const q1 = getTopCustomers(db, TENANT, 10, '2026-01-01', '2026-03-31');
    expect(q1.find((r) => r.customer_name === 'Ama')?.revenue_pesewas).toBe(100_000);
    expect(q1.find((r) => r.customer_name === 'Kofi')?.revenue_pesewas ?? 0).toBe(0);
  });
});

describe('getTripLog', () => {
  it('lists every trip when no range is given', () => {
    expect(getTripLog(db, TENANT, 50)).toHaveLength(2);
  });

  it('lists only trips starting inside the range', () => {
    const q3 = getTripLog(db, TENANT, 50, '2026-07-01', '2026-09-30');
    expect(q3).toHaveLength(1);
    expect(q3[0].customer_name).toBe('Kofi');
  });

  it('returns nothing for a period with no trips', () => {
    expect(getTripLog(db, TENANT, 50, '2026-04-01', '2026-06-30')).toEqual([]);
  });
});

describe('getUtilization', () => {
  function onlyBooking(id: string, starts: string, ends: string, qty: number): void {
    // Clear in foreign-key order; the shared fixture hangs invoices and
    // payments off its bookings.
    db.prepare('DELETE FROM payments').run();
    db.prepare('DELETE FROM invoices').run();
    db.prepare('DELETE FROM booking_lines').run();
    db.prepare('DELETE FROM bookings').run();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO bookings (id, tenant_id, customer_id, status, starts_at, ends_at, created_at, updated_at)
       VALUES (@id, @t, 'cust-Ama', 'returned', @s, @e, @n, @n)`,
    ).run({ id, t: TENANT, s: starts, e: ends, n: now });
    db.prepare(
      `INSERT INTO booking_lines (id, tenant_id, booking_id, item_id, quantity, daily_rate_pesewas, created_at, updated_at)
       VALUES (@lid, @t, @id, @item, @q, 50000, @n, @n)`,
    ).run({ lid: `line-${id}`, t: TENANT, id, item: HEARSE, q: qty, n: now });
  }

  it('counts a part-day rental the same way the invoice charges for it', () => {
    // 08:00 on the 1st to 07:00 on the 3rd spans 1.96 days. The invoice bills
    // ceil(1.96) = 2. Utilisation used CAST, which truncates to 1 — so every
    // part-day hire was under-reported by a whole day and the two figures could
    // never be reconciled.
    onlyBooking('b1', '2026-01-01T08:00:00.000Z', '2026-01-03T07:00:00.000Z', 10);
    const [row] = getUtilization(db, TENANT, '2026-01-01', '2026-01-31');
    expect(row.booked_quantity_days).toBe(20); // 10 units x 2 days
  });

  it('still counts a whole-day rental as whole days', () => {
    onlyBooking('b2', '2026-01-01T08:00:00.000Z', '2026-01-04T08:00:00.000Z', 1);
    const [row] = getUtilization(db, TENANT, '2026-01-01', '2026-01-31');
    expect(row.booked_quantity_days).toBe(3);
  });

  it('never counts less than a day for a booking that happened', () => {
    onlyBooking('b3', '2026-01-01T08:00:00.000Z', '2026-01-01T10:00:00.000Z', 1);
    const [row] = getUtilization(db, TENANT, '2026-01-01', '2026-01-31');
    expect(row.booked_quantity_days).toBe(1);
  });
});
