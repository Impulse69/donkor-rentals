import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import {
  BOOKING_STATUS_TRANSITIONS,
  BOOKING_STATUS_LABELS,
  type Booking,
  type BookingCreateInput,
  type BookingUpdateInput,
  type BookingFilter,
  type BookingLine,
  type BookingStatus,
  type ConflictCheckInput,
  type ConflictReport,
} from '@shared/schemas';

const BOOKING_COLS = `id, tenant_id, customer_id, renter_name, status, starts_at, ends_at,
  pickup_location, dropoff_location, driver_name, notes,
  created_at, updated_at, deleted_at`;

const LINE_COLS = `id, tenant_id, booking_id, item_id, item_unit_id, quantity,
  daily_rate_pesewas, odometer_start_km, odometer_end_km,
  fuel_litres_start, fuel_litres_end, notes,
  created_at, updated_at, deleted_at`;

const ACTIVE_STATUSES = ['quote', 'reserved', 'out'] as const;

function nowIso(): string {
  return new Date().toISOString();
}

export interface BookingWithLines extends Booking {
  customer_name: string;
  lines: BookingLine[];
}

export function listBookings(
  db: Database,
  tenantId: string,
  filter: BookingFilter = {},
): Array<Booking & { customer_name: string }> {
  const params: Record<string, unknown> = { tenant_id: tenantId };
  let sql = `SELECT ${BOOKING_COLS.split(',').map((c) => `b.${c.trim()}`).join(', ')},
    COALESCE(c.name, b.renter_name) as customer_name
    FROM bookings b
    LEFT JOIN customers c ON c.id = b.customer_id
    WHERE b.tenant_id = @tenant_id`;
  if (!filter.includeDeleted) sql += ' AND b.deleted_at IS NULL';
  if (filter.status) {
    sql += ' AND b.status = @status';
    params.status = filter.status;
  }
  if (filter.customerId) {
    sql += ' AND b.customer_id = @customer_id';
    params.customer_id = filter.customerId;
  }
  if (filter.windowStart && filter.windowEnd) {
    // Overlapping windows: starts_at < window_end AND ends_at > window_start.
    // ISO 8601 strings sort lexicographically; plain comparison uses the index.
    sql += ' AND b.starts_at < @window_end AND b.ends_at > @window_start';
    params.window_start = filter.windowStart;
    params.window_end = filter.windowEnd;
  }
  if (filter.search) {
    sql += ' AND (c.name LIKE @q OR b.renter_name LIKE @q OR b.driver_name LIKE @q OR b.notes LIKE @q)';
    params.q = `%${filter.search}%`;
  }
  sql += ' ORDER BY b.updated_at DESC';
  return db.prepare(sql).all(params) as Array<Booking & { customer_name: string }>;
}

export function getBooking(
  db: Database,
  tenantId: string,
  id: string,
): BookingWithLines | null {
  const row = db
    .prepare(
      `SELECT ${BOOKING_COLS.split(',').map((c) => `b.${c.trim()}`).join(', ')},
              COALESCE(c.name, b.renter_name) as customer_name
       FROM bookings b
       LEFT JOIN customers c ON c.id = b.customer_id
       WHERE b.id = @id AND b.tenant_id = @tenant_id`,
    )
    .get({ id, tenant_id: tenantId }) as (Booking & { customer_name: string }) | undefined;
  if (!row) return null;
  const lines = db
    .prepare(
      `SELECT ${LINE_COLS} FROM booking_lines
       WHERE booking_id = @id AND tenant_id = @tenant_id AND deleted_at IS NULL
       ORDER BY created_at ASC`,
    )
    .all({ id, tenant_id: tenantId }) as BookingLine[];
  return { ...row, lines };
}

/**
 * Detect conflicts for a candidate booking window + lines.
 * Considers only active bookings (quote / reserved / out). Returns one report
 * per requested line, even when no conflict — the UI uses `available` to show
 * remaining headroom.
 */
export function checkConflicts(
  db: Database,
  tenantId: string,
  input: ConflictCheckInput,
): ConflictReport[] {
  const reports: ConflictReport[] = [];
  for (const line of input.lines) {
    const item = db
      .prepare(
        `SELECT id, name, total_quantity FROM items
         WHERE id = @id AND tenant_id = @tenant_id AND deleted_at IS NULL`,
      )
      .get({ id: line.item_id, tenant_id: tenantId }) as
      | { id: string; name: string; total_quantity: number }
      | undefined;
    if (!item) {
      reports.push({
        itemId: line.item_id,
        itemName: '(missing)',
        unitId: line.item_unit_id ?? null,
        unitIdentifier: null,
        requested: line.quantity,
        alreadyHeld: 0,
        available: -line.quantity,
        total: 0,
        conflictingBookings: [],
      });
      continue;
    }

    const isUnitScoped = Boolean(line.item_unit_id);
    let unitIdentifier: string | null = null;
    if (isUnitScoped) {
      const u = db
         .prepare(`SELECT identifier FROM item_units WHERE id = @id AND tenant_id = @tenant_id`)
        .get({ id: line.item_unit_id, tenant_id: tenantId }) as { identifier: string } | undefined;
      unitIdentifier = u?.identifier ?? null;
    }

    // Find overlapping ACTIVE bookings that touch this item / unit.
    // Note on pool/unit interaction: when @unit_id IS NULL we are checking a
    // pool item; we sum across BOTH pool rows and unit-pinned rows for that
    // item, since unit-pinned rows still consume from the same physical pool.
    const overlapSql = `
      SELECT b.id, b.starts_at, b.ends_at, b.status,
             COALESCE(c.name, b.renter_name) as customer_name,
             bl.quantity as held_qty
      FROM booking_lines bl
      JOIN bookings  b ON b.id = bl.booking_id
      LEFT JOIN customers c ON c.id = b.customer_id
      WHERE bl.tenant_id = @tenant_id
        AND bl.deleted_at IS NULL
        AND b.deleted_at IS NULL
        AND b.status IN ('quote','reserved','out')
        AND bl.item_id = @item_id
        AND ( @unit_id IS NULL OR bl.item_unit_id = @unit_id )
        AND ( @exclude IS NULL OR b.id != @exclude )
        AND b.starts_at < @window_end
        AND b.ends_at   > @window_start
      ORDER BY b.starts_at ASC
    `;
    const overlap = db.prepare(overlapSql).all({
      tenant_id: tenantId,
      item_id: line.item_id,
      unit_id: line.item_unit_id ?? null,
      window_start: input.starts_at,
      window_end: input.ends_at,
      exclude: input.excludeBookingId ?? null,
    }) as Array<{
      id: string;
      starts_at: string;
      ends_at: string;
      status: 'quote' | 'reserved' | 'out';
      customer_name: string;
      held_qty: number;
    }>;

    const alreadyHeld = isUnitScoped
      ? overlap.length > 0 ? 1 : 0 // unit booked at all = unavailable
      : overlap.reduce((sum, o) => sum + o.held_qty, 0);
    const totalCapacity = isUnitScoped ? 1 : item.total_quantity;
    const available = totalCapacity - alreadyHeld;

    reports.push({
      itemId: item.id,
      itemName: item.name,
      unitId: line.item_unit_id ?? null,
      unitIdentifier,
      requested: line.quantity,
      alreadyHeld,
      available,
      total: totalCapacity,
      conflictingBookings: overlap.map((o) => ({
        id: o.id,
        starts_at: o.starts_at,
        ends_at: o.ends_at,
        customer_name: o.customer_name,
        status: o.status,
      })),
    });
  }
  return reports;
}

/** Throws when any line would over-allocate. */
function assertNoConflicts(
  db: Database,
  tenantId: string,
  input: ConflictCheckInput,
): void {
  const reports = checkConflicts(db, tenantId, input);
  const blocked = reports.filter((r) => r.available < r.requested);
  if (blocked.length === 0) return;
  const detail = blocked
    .map((r) => `${r.itemName}: requested ${r.requested}, only ${r.available >= 0 ? r.available : 0} free of ${r.total}`)
    .join('; ');
  throw new Error(`Booking conflict — ${detail}`);
}

export function createBooking(
  db: Database,
  tenantId: string,
  input: BookingCreateInput,
): BookingWithLines {
  const id = uuidv4();
  const now = nowIso();

  const insertBooking = db.prepare(
    `INSERT INTO bookings (${BOOKING_COLS})
     VALUES (@id, @tenant_id, @customer_id, @renter_name, @status, @starts_at, @ends_at,
             @pickup_location, @dropoff_location, @driver_name, @notes,
             @created_at, @updated_at, NULL)`,
  );
  const insertLine = db.prepare(
    `INSERT INTO booking_lines (${LINE_COLS})
     VALUES (@id, @tenant_id, @booking_id, @item_id, @item_unit_id, @quantity,
             @daily_rate_pesewas, @odometer_start_km, @odometer_end_km,
             @fuel_litres_start, @fuel_litres_end, @notes,
             @created_at, @updated_at, NULL)`,
  );

  // Conflict check + insert run in a single transaction so two concurrent
  // creates can't both pass the check then both insert.
  const tx = db.transaction(() => {
    assertNoConflicts(db, tenantId, {
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      lines: input.lines.map((l) => ({
        item_id: l.item_id,
        item_unit_id: l.item_unit_id ?? null,
        quantity: l.quantity,
      })),
    });
    insertBooking.run({
      id,
      tenant_id: tenantId,
      customer_id: input.customer_id,
      renter_name: input.renter_name ?? null,
      status: input.status ?? 'quote',
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      pickup_location: input.pickup_location ?? null,
      dropoff_location: input.dropoff_location ?? null,
      driver_name: input.driver_name ?? null,
      notes: input.notes ?? null,
      created_at: now,
      updated_at: now,
    });
    for (const line of input.lines) {
      insertLine.run({
        id: uuidv4(),
        tenant_id: tenantId,
        booking_id: id,
        item_id: line.item_id,
        item_unit_id: line.item_unit_id ?? null,
        quantity: line.quantity,
        daily_rate_pesewas: line.daily_rate_pesewas,
        odometer_start_km: line.odometer_start_km ?? null,
        odometer_end_km: line.odometer_end_km ?? null,
        fuel_litres_start: line.fuel_litres_start ?? null,
        fuel_litres_end: line.fuel_litres_end ?? null,
        notes: line.notes ?? null,
        created_at: now,
        updated_at: now,
      });
    }
  });
  tx();

  const created = getBooking(db, tenantId, id);
  if (!created) throw new Error('createBooking: readback failed');
  return created;
}

export function updateBooking(
  db: Database,
  tenantId: string,
  id: string,
  patch: BookingUpdateInput,
): BookingWithLines {
  const existing = getBooking(db, tenantId, id);
  if (!existing) throw new Error(`updateBooking: booking ${id} not found`);

  // If the time window changes, re-check conflicts (lines unchanged here).
  if (
    (patch.starts_at && patch.starts_at !== existing.starts_at) ||
    (patch.ends_at && patch.ends_at !== existing.ends_at)
  ) {
    assertNoConflicts(db, tenantId, {
      starts_at: patch.starts_at ?? existing.starts_at,
      ends_at: patch.ends_at ?? existing.ends_at,
      excludeBookingId: id,
      lines: existing.lines.map((l) => ({
        item_id: l.item_id,
        item_unit_id: l.item_unit_id,
        quantity: l.quantity,
      })),
    });
  }

  const merged = { ...existing, ...patch, updated_at: nowIso() };
  db.prepare(
    `UPDATE bookings SET
       customer_id = @customer_id, renter_name = @renter_name, status = @status,
       starts_at = @starts_at, ends_at = @ends_at,
       pickup_location = @pickup_location, dropoff_location = @dropoff_location,
       driver_name = @driver_name, notes = @notes, updated_at = @updated_at
     WHERE id = @id AND tenant_id = @tenant_id`,
  ).run({
    id,
    tenant_id: tenantId,
    customer_id: merged.customer_id,
    renter_name: merged.renter_name ?? null,
    status: merged.status,
    starts_at: merged.starts_at,
    ends_at: merged.ends_at,
    pickup_location: merged.pickup_location ?? null,
    dropoff_location: merged.dropoff_location ?? null,
    driver_name: merged.driver_name ?? null,
    notes: merged.notes ?? null,
    updated_at: merged.updated_at,
  });
  const after = getBooking(db, tenantId, id);
  if (!after) throw new Error('updateBooking: readback failed');
  return after;
}

export function transitionBooking(
  db: Database,
  tenantId: string,
  id: string,
  next: BookingStatus,
): BookingWithLines {
  const existing = getBooking(db, tenantId, id);
  if (!existing) throw new Error(`transitionBooking: booking ${id} not found`);
  const allowed = BOOKING_STATUS_TRANSITIONS[existing.status];
  if (!allowed.includes(next)) {
    throw new Error(
      `Cannot move booking from ${BOOKING_STATUS_LABELS[existing.status]} to ${BOOKING_STATUS_LABELS[next]}`,
    );
  }
  return updateBooking(db, tenantId, id, { status: next });
}

export function softDeleteBooking(db: Database, tenantId: string, id: string): void {
  db.prepare(
    `UPDATE bookings SET deleted_at = @t, updated_at = @t
     WHERE id = @id AND tenant_id = @tenant_id AND deleted_at IS NULL`,
  ).run({ id, tenant_id: tenantId, t: nowIso() });
}

/** Adjust a single booking_line (qty, rates, hearse fields). */
export function updateBookingLine(
  db: Database,
  tenantId: string,
  lineId: string,
  patch: Partial<Omit<BookingLine, 'id' | 'tenant_id' | 'booking_id' | 'created_at' | 'updated_at' | 'deleted_at'>>,
): BookingLine {
  const existing = db
    .prepare(`SELECT ${LINE_COLS} FROM booking_lines WHERE id = @id AND tenant_id = @tenant_id`)
    .get({ id: lineId, tenant_id: tenantId }) as BookingLine | undefined;
  if (!existing) throw new Error(`updateBookingLine: line ${lineId} not found`);
  const merged = { ...existing, ...patch, updated_at: nowIso() };
  db.prepare(
    `UPDATE booking_lines SET
       quantity = @quantity, daily_rate_pesewas = @daily_rate_pesewas,
       odometer_start_km = @odometer_start_km, odometer_end_km = @odometer_end_km,
       fuel_litres_start = @fuel_litres_start, fuel_litres_end = @fuel_litres_end,
       notes = @notes, updated_at = @updated_at
     WHERE id = @id AND tenant_id = @tenant_id`,
  ).run({
    id: lineId,
    tenant_id: tenantId,
    quantity: merged.quantity,
    daily_rate_pesewas: merged.daily_rate_pesewas,
    odometer_start_km: merged.odometer_start_km ?? null,
    odometer_end_km: merged.odometer_end_km ?? null,
    fuel_litres_start: merged.fuel_litres_start ?? null,
    fuel_litres_end: merged.fuel_litres_end ?? null,
    notes: merged.notes ?? null,
    updated_at: merged.updated_at,
  });
  const after = db
    .prepare(`SELECT ${LINE_COLS} FROM booking_lines WHERE id = @id`)
    .get({ id: lineId }) as BookingLine | undefined;
  if (!after) throw new Error('updateBookingLine: readback failed');
  return after;
}

export const ACTIVE_BOOKING_STATUSES = ACTIVE_STATUSES;
