import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { checkConflicts, createBooking } from './bookings';

/**
 * The conflict engine is the highest-consequence logic in this app: a
 * double-booked hearse means two funerals expecting the same vehicle. It had no
 * test coverage at all, so these pin its actual contract — overlap semantics,
 * pooled versus unit-pinned capacity, which statuses hold stock, and the
 * self-exclusion used when editing an existing booking.
 */
const MIGRATIONS = join(__dirname, '..', '..', '..', '..', '..', 'packages', 'db', 'sqlite', 'migrations');
const TENANT = '00000000-0000-4000-8000-000000000001';
const CHAIRS = 'item-chairs';
const HEARSE = 'item-hearse';
const UNIT_A = 'unit-a';
const UNIT_B = 'unit-b';

let db: Database.Database;

function makeDb(): Database.Database {
  const d = new Database(':memory:');
  d.pragma('foreign_keys = ON');
  // Apply every shipped migration in order, exactly as the real runner does.
  // A hardcoded list here silently pins tests to an old schema the moment a
  // migration lands.
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
    d.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  }
  const now = new Date().toISOString();
  d.prepare(
    `INSERT INTO tenants (id, name, currency, locale, created_at, updated_at)
     VALUES (?, 'Donkor', 'GHS', 'en-GB', ?, ?)`,
  ).run(TENANT, now, now);
  const item = d.prepare(
    `INSERT INTO items (id, tenant_id, kind, sku, name, daily_rate_pesewas,
      replacement_value_pesewas, total_quantity, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1000, 5000, ?, 'active', ?, ?)`,
  );
  item.run(CHAIRS, TENANT, 'party_supply', 'CHAIR', 'Chairs', 100, now, now);
  item.run(HEARSE, TENANT, 'hearse', 'HRS', 'Hearse', 2, now, now);
  const unit = d.prepare(
    `INSERT INTO item_units (id, tenant_id, item_id, identifier, current_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'available', ?, ?)`,
  );
  unit.run(UNIT_A, TENANT, HEARSE, 'GR-1111', now, now);
  unit.run(UNIT_B, TENANT, HEARSE, 'GR-2222', now, now);
  return d;
}

type BookOpts = {
  starts: string;
  ends: string;
  itemId: string;
  quantity: number;
  unitId?: string | null;
  status?: 'quote' | 'reserved' | 'out' | 'returned' | 'cancelled';
  phone?: string;
};

function book(opts: BookOpts): string {
  const created = createBooking(db, TENANT, {
    customer_id: null,
    renter_name: 'Walk-in',
    renter_phone: opts.phone ?? null,
    starts_at: opts.starts,
    ends_at: opts.ends,
    pickup_location: null,
    dropoff_location: null,
    driver_name: null,
    notes: null,
    lines: [{
      item_id: opts.itemId,
      item_unit_id: opts.unitId ?? null,
      quantity: opts.quantity,
      daily_rate_pesewas: 1000,
      notes: null,
    }],
  } as Parameters<typeof createBooking>[2]);
  if (opts.status && opts.status !== 'quote') {
    db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(opts.status, created.id);
  }
  return created.id;
}

function check(opts: {
  starts: string;
  ends: string;
  itemId: string;
  quantity: number;
  unitId?: string | null;
  exclude?: string;
}) {
  return checkConflicts(db, TENANT, {
    starts_at: opts.starts,
    ends_at: opts.ends,
    excludeBookingId: opts.exclude ?? null,
    lines: [{ item_id: opts.itemId, item_unit_id: opts.unitId ?? null, quantity: opts.quantity }],
  } as Parameters<typeof checkConflicts>[2])[0];
}

beforeEach(() => {
  db = makeDb();
});

describe('conflict windows', () => {
  it('treats the window as half-open, so back-to-back bookings do not collide', () => {
    book({ starts: '2026-03-01T08:00:00.000Z', ends: '2026-03-02T08:00:00.000Z', itemId: HEARSE, quantity: 1, unitId: UNIT_A });

    const after = check({ starts: '2026-03-02T08:00:00.000Z', ends: '2026-03-03T08:00:00.000Z', itemId: HEARSE, quantity: 1, unitId: UNIT_A });
    expect(after.conflictingBookings).toHaveLength(0);
    expect(after.available).toBe(1);

    const before = check({ starts: '2026-02-28T08:00:00.000Z', ends: '2026-03-01T08:00:00.000Z', itemId: HEARSE, quantity: 1, unitId: UNIT_A });
    expect(before.conflictingBookings).toHaveLength(0);
  });

  it('detects a one-minute overlap', () => {
    book({ starts: '2026-03-01T08:00:00.000Z', ends: '2026-03-02T08:00:00.000Z', itemId: HEARSE, quantity: 1, unitId: UNIT_A });
    const r = check({ starts: '2026-03-02T07:59:00.000Z', ends: '2026-03-03T08:00:00.000Z', itemId: HEARSE, quantity: 1, unitId: UNIT_A });
    expect(r.conflictingBookings).toHaveLength(1);
    expect(r.available).toBe(0);
  });

  it('detects a booking fully enclosed by another', () => {
    book({ starts: '2026-03-01T00:00:00.000Z', ends: '2026-03-10T00:00:00.000Z', itemId: HEARSE, quantity: 1, unitId: UNIT_A });
    const r = check({ starts: '2026-03-04T00:00:00.000Z', ends: '2026-03-05T00:00:00.000Z', itemId: HEARSE, quantity: 1, unitId: UNIT_A });
    expect(r.conflictingBookings).toHaveLength(1);
  });
});

describe('unit-pinned capacity', () => {
  it('makes a booked unit unavailable regardless of quantity asked', () => {
    book({ starts: '2026-03-01T00:00:00.000Z', ends: '2026-03-05T00:00:00.000Z', itemId: HEARSE, quantity: 1, unitId: UNIT_A });
    const r = check({ starts: '2026-03-02T00:00:00.000Z', ends: '2026-03-03T00:00:00.000Z', itemId: HEARSE, quantity: 1, unitId: UNIT_A });
    expect(r.total).toBe(1);
    expect(r.alreadyHeld).toBe(1);
    expect(r.available).toBe(0);
  });

  it('leaves a sibling unit free', () => {
    book({ starts: '2026-03-01T00:00:00.000Z', ends: '2026-03-05T00:00:00.000Z', itemId: HEARSE, quantity: 1, unitId: UNIT_A });
    const r = check({ starts: '2026-03-02T00:00:00.000Z', ends: '2026-03-03T00:00:00.000Z', itemId: HEARSE, quantity: 1, unitId: UNIT_B });
    expect(r.available).toBe(1);
    expect(r.conflictingBookings).toHaveLength(0);
  });

  it('reports the unit identifier so the UI can name the clash', () => {
    const r = check({ starts: '2026-03-02T00:00:00.000Z', ends: '2026-03-03T00:00:00.000Z', itemId: HEARSE, quantity: 1, unitId: UNIT_A });
    expect(r.unitIdentifier).toBe('GR-1111');
  });
});

describe('pooled capacity', () => {
  it('subtracts held quantity from the pool', () => {
    book({ starts: '2026-03-01T00:00:00.000Z', ends: '2026-03-05T00:00:00.000Z', itemId: CHAIRS, quantity: 30 });
    book({ starts: '2026-03-02T00:00:00.000Z', ends: '2026-03-04T00:00:00.000Z', itemId: CHAIRS, quantity: 25 });
    const r = check({ starts: '2026-03-03T00:00:00.000Z', ends: '2026-03-04T00:00:00.000Z', itemId: CHAIRS, quantity: 10 });
    expect(r.total).toBe(100);
    expect(r.alreadyHeld).toBe(55);
    expect(r.available).toBe(45);
  });

  it('counts unit-pinned rows against the same physical pool', () => {
    // Documented behaviour: a pool check sums pool rows AND unit-pinned rows,
    // because a pinned hearse is still one of the two hearses that exist.
    book({ starts: '2026-03-01T00:00:00.000Z', ends: '2026-03-05T00:00:00.000Z', itemId: HEARSE, quantity: 1, unitId: UNIT_A });
    const r = check({ starts: '2026-03-02T00:00:00.000Z', ends: '2026-03-03T00:00:00.000Z', itemId: HEARSE, quantity: 1 });
    expect(r.total).toBe(2);
    expect(r.alreadyHeld).toBe(1);
    expect(r.available).toBe(1);
  });
});

describe('which bookings hold stock', () => {
  it.each([
    ['quote', true],
    ['reserved', true],
    ['out', true],
    ['returned', false],
    ['cancelled', false],
  ] as const)('a %s booking holds stock: %s', (status, holds) => {
    book({ starts: '2026-03-01T00:00:00.000Z', ends: '2026-03-05T00:00:00.000Z', itemId: HEARSE, quantity: 1, unitId: UNIT_A, status });
    const r = check({ starts: '2026-03-02T00:00:00.000Z', ends: '2026-03-03T00:00:00.000Z', itemId: HEARSE, quantity: 1, unitId: UNIT_A });
    expect(r.available).toBe(holds ? 0 : 1);
  });

  it('ignores a soft-deleted booking', () => {
    const id = book({ starts: '2026-03-01T00:00:00.000Z', ends: '2026-03-05T00:00:00.000Z', itemId: HEARSE, quantity: 1, unitId: UNIT_A });
    db.prepare('UPDATE bookings SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), id);
    const r = check({ starts: '2026-03-02T00:00:00.000Z', ends: '2026-03-03T00:00:00.000Z', itemId: HEARSE, quantity: 1, unitId: UNIT_A });
    expect(r.available).toBe(1);
  });
});

describe('editing an existing booking', () => {
  it('does not treat the booking being edited as its own conflict', () => {
    const id = book({ starts: '2026-03-01T00:00:00.000Z', ends: '2026-03-05T00:00:00.000Z', itemId: HEARSE, quantity: 1, unitId: UNIT_A });

    const without = check({ starts: '2026-03-01T00:00:00.000Z', ends: '2026-03-05T00:00:00.000Z', itemId: HEARSE, quantity: 1, unitId: UNIT_A });
    expect(without.available).toBe(0);

    const excluded = check({ starts: '2026-03-01T00:00:00.000Z', ends: '2026-03-05T00:00:00.000Z', itemId: HEARSE, quantity: 1, unitId: UNIT_A, exclude: id });
    expect(excluded.available).toBe(1);
  });
});

describe('over-allocation is refused at write time', () => {
  it('rejects a pooled booking that exceeds remaining stock', () => {
    book({ starts: '2026-03-01T00:00:00.000Z', ends: '2026-03-05T00:00:00.000Z', itemId: CHAIRS, quantity: 95 });
    expect(() =>
      book({ starts: '2026-03-02T00:00:00.000Z', ends: '2026-03-03T00:00:00.000Z', itemId: CHAIRS, quantity: 10 }),
    ).toThrow(/conflict/i);
  });

  it('rejects double-booking the same hearse', () => {
    book({ starts: '2026-03-01T00:00:00.000Z', ends: '2026-03-05T00:00:00.000Z', itemId: HEARSE, quantity: 1, unitId: UNIT_A });
    expect(() =>
      book({ starts: '2026-03-02T00:00:00.000Z', ends: '2026-03-03T00:00:00.000Z', itemId: HEARSE, quantity: 1, unitId: UNIT_A }),
    ).toThrow(/conflict/i);
  });

  it('allows booking right up to remaining capacity', () => {
    book({ starts: '2026-03-01T00:00:00.000Z', ends: '2026-03-05T00:00:00.000Z', itemId: CHAIRS, quantity: 60 });
    expect(() =>
      book({ starts: '2026-03-02T00:00:00.000Z', ends: '2026-03-03T00:00:00.000Z', itemId: CHAIRS, quantity: 40 }),
    ).not.toThrow();
  });
});

describe('walk-in reachability', () => {
  it('keeps the phone a walk-in gave, and allows none at all', () => {
    const withPhone = book({ starts: '2026-04-01T00:00:00.000Z', ends: '2026-04-02T00:00:00.000Z', itemId: CHAIRS, quantity: 1, phone: '0244 123 456' });
    const without = book({ starts: '2026-04-03T00:00:00.000Z', ends: '2026-04-04T00:00:00.000Z', itemId: CHAIRS, quantity: 1 });

    const read = (id: string): string | null =>
      (db.prepare('SELECT renter_phone FROM bookings WHERE id = ?').get(id) as { renter_phone: string | null }).renter_phone;

    expect(read(withPhone)).toBe('0244 123 456');
    // Optional on purpose: a walk-in who refuses a number must not block the booking.
    expect(read(without)).toBeNull();
  });
});

describe('unknown items', () => {
  it('reports a missing item as unavailable rather than throwing', () => {
    const r = check({ starts: '2026-03-01T00:00:00.000Z', ends: '2026-03-02T00:00:00.000Z', itemId: 'does-not-exist', quantity: 3 });
    expect(r.itemName).toBe('(missing)');
    expect(r.available).toBe(-3);
  });
});
