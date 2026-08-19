import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { checkConflicts, createBooking, updateBooking } from './bookings';

/**
 * Two ways the capacity guard could be walked around.
 *
 * The existing suite covers conflicts BETWEEN bookings. These cover the two
 * gaps: capacity consumed WITHIN a single booking, and capacity consumed by a
 * booking that is put back into a holding status after the fact.
 *
 * Overbooking is the one failure this app exists to prevent — 80 chairs promised
 * out of a pool of 50 is only discovered on the morning of the funeral.
 */
const MIGRATIONS = join(__dirname, '..', '..', '..', '..', '..', 'packages', 'db', 'sqlite', 'migrations');
const TENANT = '00000000-0000-4000-8000-000000000001';
const CHAIRS = 'item-chairs';

const START = '2026-04-01T00:00:00.000Z';
const END = '2026-04-03T00:00:00.000Z';

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
     VALUES (?, ?, 'party_supply', 'CHAIR', 'Chairs', 1000, 5000, 50, 'active', ?, ?)`,
  ).run(CHAIRS, TENANT, now, now);
  return d;
}

function bookLines(lines: Array<{ quantity: number }>): string {
  return createBooking(db, TENANT, {
    customer_id: null,
    renter_name: 'Walk-in',
    renter_phone: null,
    starts_at: START,
    ends_at: END,
    pickup_location: null,
    dropoff_location: null,
    driver_name: null,
    notes: null,
    lines: lines.map((l) => ({
      item_id: CHAIRS,
      item_unit_id: null,
      quantity: l.quantity,
      daily_rate_pesewas: 1000,
      notes: null,
    })),
  } as Parameters<typeof createBooking>[2]).id;
}

function heldNow(): number {
  const [report] = checkConflicts(db, TENANT, {
    starts_at: START,
    ends_at: END,
    lines: [{ item_id: CHAIRS, item_unit_id: null, quantity: 1 }],
  } as Parameters<typeof checkConflicts>[2]);
  return report.alreadyHeld;
}

beforeEach(() => {
  db = makeDb();
});

describe('capacity within a single booking', () => {
  it('counts two lines of the same item against each other', () => {
    // 40 + 40 chairs out of a pool of 50. Each line was checked on its own
    // against a database that did not yet contain its sibling, so both passed.
    expect(() => bookLines([{ quantity: 40 }, { quantity: 40 }])).toThrow();
  });

  it('still allows two lines that fit together', () => {
    expect(() => bookLines([{ quantity: 20 }, { quantity: 20 }])).not.toThrow();
    expect(heldNow()).toBe(40);
  });

  it('allows a single line that exactly fills the pool', () => {
    expect(() => bookLines([{ quantity: 50 }])).not.toThrow();
  });
});

describe('capacity when a booking is put back into a holding status', () => {
  it('refuses to revive a cancelled booking whose stock has been given away', () => {
    const first = bookLines([{ quantity: 50 }]);
    db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(first);

    // The freed stock is legitimately re-let to someone else.
    bookLines([{ quantity: 50 }]);
    expect(heldNow()).toBe(50);

    // Reviving the cancelled booking would commit 100 chairs out of 50.
    expect(() =>
      updateBooking(db, TENANT, first, { status: 'reserved' } as Parameters<typeof updateBooking>[3]),
    ).toThrow();
    expect(heldNow()).toBe(50);
  });

  it('still allows a status change that does not add pressure', () => {
    const only = bookLines([{ quantity: 50 }]);
    expect(() =>
      updateBooking(db, TENANT, only, { status: 'reserved' } as Parameters<typeof updateBooking>[3]),
    ).not.toThrow();
  });

  it('still allows cancelling and returning, which release stock', () => {
    const only = bookLines([{ quantity: 50 }]);
    expect(() =>
      updateBooking(db, TENANT, only, { status: 'cancelled' } as Parameters<typeof updateBooking>[3]),
    ).not.toThrow();
    expect(heldNow()).toBe(0);
  });
});
