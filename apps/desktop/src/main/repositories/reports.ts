import type { Database } from 'better-sqlite3';
import { calculateUtilizationPercent } from '@shared/reports';

export interface ReportsOverview {
  revenue_today_pesewas: number;
  revenue_week_pesewas: number;
  revenue_month_pesewas: number;
  outstanding_pesewas: number;
  active_bookings: number;
  open_damage_pesewas: number;
}

export interface UtilizationRow {
  item_id: string;
  item_name: string;
  kind: 'party_supply' | 'hearse';
  total_quantity: number;
  booked_quantity_days: number;
  utilization_percent: number;
}

export interface TopCustomerRow {
  customer_id: string;
  customer_name: string;
  revenue_pesewas: number;
  bookings: number;
}

export interface TripLogRow {
  booking_id: string;
  customer_name: string;
  starts_at: string;
  ends_at: string;
  driver_name: string | null;
  pickup_location: string | null;
  dropoff_location: string | null;
  item_name: string;
  plate: string | null;
  odometer_start_km: number | null;
  odometer_end_km: number | null;
}

export interface DamageSummaryRow {
  item_id: string;
  item_name: string;
  damaged_quantity: number;
  charges_pesewas: number;
  write_offs: number;
}

export function getOverview(db: Database, tenantId: string): ReportsOverview {
  const now = new Date();
  const today = startOfDay(now).toISOString();
  const week = new Date(now);
  week.setDate(now.getDate() - 6);
  const month = new Date(now);
  month.setDate(1);
  month.setHours(0, 0, 0, 0);

  return {
    revenue_today_pesewas: revenueSince(db, tenantId, today),
    revenue_week_pesewas: revenueSince(db, tenantId, startOfDay(week).toISOString()),
    revenue_month_pesewas: revenueSince(db, tenantId, month.toISOString()),
    outstanding_pesewas: outstanding(db, tenantId),
    active_bookings: (db
      .prepare(
        `SELECT COUNT(*) AS n FROM bookings
         WHERE tenant_id = @tenant_id AND deleted_at IS NULL AND status IN ('reserved', 'out')`,
      )
      .get({ tenant_id: tenantId }) as { n: number }).n,
    open_damage_pesewas: (db
      .prepare(
        `SELECT COALESCE(SUM(balance_due_pesewas), 0) AS n FROM returns
         WHERE tenant_id = @tenant_id AND deleted_at IS NULL`,
      )
      .get({ tenant_id: tenantId }) as { n: number }).n,
  };
}

export function getUtilization(
  db: Database,
  tenantId: string,
  start: string,
  end: string,
): UtilizationRow[] {
  const windowDays = Math.max(1, Math.ceil((Date.parse(end) - Date.parse(start)) / 86_400_000));
  const rows = db
    .prepare(
      `SELECT i.id AS item_id, i.name AS item_name, i.kind, i.total_quantity,
              COALESCE(SUM(
                bl.quantity * MAX(1, CAST(julianday(MIN(b.ends_at, @end)) - julianday(MAX(b.starts_at, @start)) AS INTEGER))
              ), 0) AS booked_quantity_days
       FROM items i
       LEFT JOIN booking_lines bl ON bl.item_id = i.id AND bl.deleted_at IS NULL
       LEFT JOIN bookings b ON b.id = bl.booking_id
         AND b.deleted_at IS NULL
         AND b.status IN ('reserved', 'out', 'returned')
         AND b.starts_at < @end
         AND b.ends_at > @start
       WHERE i.tenant_id = @tenant_id AND i.deleted_at IS NULL
       GROUP BY i.id
       ORDER BY booked_quantity_days DESC, i.name ASC`,
    )
    .all({ tenant_id: tenantId, start, end }) as Array<Omit<UtilizationRow, 'utilization_percent'>>;

  return rows.map((row) => ({
    ...row,
    booked_quantity_days: Number(row.booked_quantity_days ?? 0),
    utilization_percent: calculateUtilizationPercent({
      bookedQuantityDays: Number(row.booked_quantity_days ?? 0),
      totalQuantity: row.kind === 'hearse' ? Math.max(1, row.total_quantity) : row.total_quantity,
      windowDays,
    }),
  }));
}

/**
 * Highest-revenue customers, optionally within a period.
 *
 * The screen has always offered a date range for this. It was never passed
 * through, so picking "This quarter" returned all-time figures under a heading
 * that said otherwise — the kind of wrong that gets repeated to a client.
 *
 * "Revenue in the period" means cash actually received in it, and the booking
 * count is scoped to bookings that start in it, so the two columns describe the
 * same window.
 */
export function getTopCustomers(
  db: Database,
  tenantId: string,
  limit = 10,
  start?: string,
  end?: string,
): TopCustomerRow[] {
  const ranged = Boolean(start && end);
  return db
    .prepare(
      `SELECT c.id AS customer_id, c.name AS customer_name,
              COALESCE(SUM(CASE WHEN p.kind = 'refund' THEN -p.amount_pesewas ELSE p.amount_pesewas END), 0) AS revenue_pesewas,
              COUNT(DISTINCT b.id) AS bookings
       FROM customers c
       JOIN bookings b ON b.customer_id = c.id AND b.deleted_at IS NULL
         ${ranged ? 'AND date(b.starts_at) BETWEEN @start AND @end' : ''}
       LEFT JOIN invoices i ON i.booking_id = b.id AND i.deleted_at IS NULL
       LEFT JOIN payments p ON p.invoice_id = i.id AND p.deleted_at IS NULL
         ${ranged ? 'AND date(p.paid_at) BETWEEN @start AND @end' : ''}
       WHERE c.tenant_id = @tenant_id AND c.deleted_at IS NULL
       GROUP BY c.id
       ORDER BY revenue_pesewas DESC, bookings DESC
       LIMIT @limit`,
    )
    .all(
      ranged
        ? { tenant_id: tenantId, limit, start, end }
        : { tenant_id: tenantId, limit },
    ) as TopCustomerRow[];
}

/** Hearse trips, optionally limited to those starting inside a period. */
export function getTripLog(
  db: Database,
  tenantId: string,
  limit = 50,
  start?: string,
  end?: string,
): TripLogRow[] {
  const ranged = Boolean(start && end);
  return db
    .prepare(
      `SELECT b.id AS booking_id, COALESCE(c.name, b.renter_name, 'Walk-in rental') AS customer_name, b.starts_at, b.ends_at,
              b.driver_name, b.pickup_location, b.dropoff_location,
              i.name AS item_name, u.plate, bl.odometer_start_km, bl.odometer_end_km
       FROM booking_lines bl
       JOIN bookings b ON b.id = bl.booking_id
       LEFT JOIN customers c ON c.id = b.customer_id
       JOIN items i ON i.id = bl.item_id
       LEFT JOIN item_units u ON u.id = bl.item_unit_id
       WHERE bl.tenant_id = @tenant_id
         AND bl.deleted_at IS NULL
         AND b.deleted_at IS NULL
         AND i.kind = 'hearse'
         ${ranged ? 'AND date(b.starts_at) BETWEEN @start AND @end' : ''}
       ORDER BY b.starts_at DESC
       LIMIT @limit`,
    )
    .all(
      ranged
        ? { tenant_id: tenantId, limit, start, end }
        : { tenant_id: tenantId, limit },
    ) as TripLogRow[];
}

export function getDamageSummary(db: Database, tenantId: string): DamageSummaryRow[] {
  return db
    .prepare(
      `SELECT i.id AS item_id, i.name AS item_name,
              COALESCE(SUM(dl.quantity), 0) AS damaged_quantity,
              COALESCE(SUM(dl.charge_pesewas), 0) AS charges_pesewas,
              COALESCE(SUM(CASE WHEN dl.write_off = 1 THEN 1 ELSE 0 END), 0) AS write_offs
       FROM damage_lines dl
       JOIN items i ON i.id = dl.item_id
       WHERE dl.tenant_id = @tenant_id
         AND dl.deleted_at IS NULL
         AND dl.condition IN ('damaged', 'lost')
       GROUP BY i.id
       ORDER BY charges_pesewas DESC, damaged_quantity DESC`,
    )
    .all({ tenant_id: tenantId }) as DamageSummaryRow[];
}

export function exportReportsCsv(db: Database, tenantId: string): string {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 30);
  const sections = [
    csvSection('overview', [getOverview(db, tenantId)]),
    csvSection('utilization', getUtilization(db, tenantId, start.toISOString(), now.toISOString())),
    csvSection('top_customers', getTopCustomers(db, tenantId)),
    csvSection('hearse_trip_log', getTripLog(db, tenantId)),
    csvSection('damage_summary', getDamageSummary(db, tenantId)),
  ];
  return sections.join('\n\n');
}

function revenueSince(db: Database, tenantId: string, since: string): number {
  return (db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN kind = 'refund' THEN -amount_pesewas ELSE amount_pesewas END), 0) AS n
       FROM payments
       WHERE tenant_id = @tenant_id AND deleted_at IS NULL AND paid_at >= @since`,
    )
    .get({ tenant_id: tenantId, since }) as { n: number }).n;
}

function outstanding(db: Database, tenantId: string): number {
  return (db
    .prepare(
      `SELECT COALESCE(SUM(i.total_pesewas - COALESCE((
          SELECT SUM(CASE WHEN p.kind = 'refund' THEN -p.amount_pesewas ELSE p.amount_pesewas END)
          FROM payments p
          WHERE p.invoice_id = i.id AND p.deleted_at IS NULL
       ), 0)), 0) AS n
       FROM invoices i
       WHERE i.tenant_id = @tenant_id AND i.deleted_at IS NULL AND i.status IN ('draft', 'issued')`,
    )
    .get({ tenant_id: tenantId }) as { n: number }).n;
}

function csvSection(name: string, rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return `${name}\n`;
  const headers = Object.keys(rows[0] ?? {});
  return [
    name,
    headers.join(','),
    ...rows.map((row) => headers.map((key) => csvValue(row[key])).join(',')),
  ].join('\n');
}

function csvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}
