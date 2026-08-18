import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { reconcileDeposit } from '@shared/returns';
import type { DamageLine, DamagePhoto, ReturnCreateInput, ReturnRecord } from '@shared/schemas';
import { buildReturnReconciledEntry, postOnce } from '../accounting/posting';
import { resolveAccount } from '../accounting/chart';
import { toEntryDate } from '../accounting/dates';

const RETURN_COLS = `id, tenant_id, booking_id, returned_at, received_by, notes,
  deposit_pesewas, total_charges_pesewas, refund_pesewas, balance_due_pesewas,
  created_at, updated_at, deleted_at`;

const DAMAGE_COLS = `id, tenant_id, return_id, booking_line_id, item_id, item_unit_id,
  condition, severity, quantity, description, charge_pesewas, write_off,
  created_at, updated_at, deleted_at`;

const PHOTO_COLS = `id, tenant_id, damage_line_id, storage_path, caption, created_at`;

function nowIso(): string {
  return new Date().toISOString();
}

export interface ReturnWithLines extends ReturnRecord {
  customer_name: string;
  booking_starts_at: string;
  booking_ends_at: string;
  lines: DamageLine[];
  photos: DamagePhoto[];
}

export function listReturns(db: Database, tenantId: string): Array<ReturnRecord & { customer_name: string }> {
  return db
    .prepare(
      `SELECT ${RETURN_COLS.split(',').map((c) => `r.${c.trim()}`).join(', ')},
              COALESCE(c.name, b.renter_name, 'Walk-in rental') AS customer_name
       FROM returns r
       JOIN bookings b ON b.id = r.booking_id
       LEFT JOIN customers c ON c.id = b.customer_id
       WHERE r.tenant_id = @tenant_id AND r.deleted_at IS NULL
       ORDER BY r.returned_at DESC`,
    )
    .all({ tenant_id: tenantId }) as Array<ReturnRecord & { customer_name: string }>;
}

export function getReturn(db: Database, tenantId: string, id: string): ReturnWithLines | null {
  const row = db
    .prepare(
      `SELECT ${RETURN_COLS.split(',').map((c) => `r.${c.trim()}`).join(', ')},
              COALESCE(c.name, b.renter_name, 'Walk-in rental') AS customer_name,
              b.starts_at AS booking_starts_at,
              b.ends_at AS booking_ends_at
       FROM returns r
       JOIN bookings b ON b.id = r.booking_id
       LEFT JOIN customers c ON c.id = b.customer_id
       WHERE r.id = @id AND r.tenant_id = @tenant_id`,
    )
    .get({ id, tenant_id: tenantId }) as
    | (ReturnRecord & { customer_name: string; booking_starts_at: string; booking_ends_at: string })
    | undefined;
  if (!row) return null;
  const lines = normalizeDamageRows(
    db
      .prepare(`SELECT ${DAMAGE_COLS} FROM damage_lines WHERE return_id = @id AND deleted_at IS NULL`)
      .all({ id }) as DamageLine[],
  );
  const photos = lines.length === 0
    ? []
    : db
      .prepare(
        `SELECT ${PHOTO_COLS} FROM damage_photos
         WHERE tenant_id = ? AND damage_line_id IN (${lines.map(() => '?').join(',')})
         ORDER BY created_at ASC`,
      )
      .all(tenantId, ...lines.map((line) => line.id)) as DamagePhoto[];
  return { ...row, lines, photos };
}

export function createReturn(db: Database, tenantId: string, input: ReturnCreateInput): ReturnWithLines {
  const booking = db
    .prepare(`SELECT id, customer_id FROM bookings WHERE id = @id AND tenant_id = @tenant_id AND deleted_at IS NULL`)
    .get({ id: input.booking_id, tenant_id: tenantId }) as { id: string; customer_id: string | null } | undefined;
  if (!booking) throw new Error('createReturn: booking not found');

  const existing = db
    .prepare(`SELECT id FROM returns WHERE booking_id = @booking_id AND tenant_id = @tenant_id AND deleted_at IS NULL`)
    .get({ booking_id: input.booking_id, tenant_id: tenantId });
  if (existing) throw new Error('A return has already been recorded for this booking.');

  const reconciliation = reconcileDeposit({
    deposit_pesewas: input.deposit_pesewas,
    charges: input.lines.map((line) => ({
      label: line.description ?? line.condition,
      amount_pesewas: line.charge_pesewas,
    })),
  });
  const id = uuidv4();
  const now = nowIso();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO returns (${RETURN_COLS})
       VALUES (@id, @tenant_id, @booking_id, @returned_at, @received_by, @notes,
         @deposit_pesewas, @total_charges_pesewas, @refund_pesewas, @balance_due_pesewas,
         @created_at, @updated_at, NULL)`,
    ).run({
      id,
      tenant_id: tenantId,
      booking_id: input.booking_id,
      returned_at: input.returned_at,
      received_by: input.received_by ?? null,
      notes: input.notes ?? null,
      ...reconciliation,
      created_at: now,
      updated_at: now,
    });

    for (const line of input.lines) {
      db.prepare(
        `INSERT INTO damage_lines (${DAMAGE_COLS})
         VALUES (@id, @tenant_id, @return_id, @booking_line_id, @item_id, @item_unit_id,
           @condition, @severity, @quantity, @description, @charge_pesewas, @write_off,
           @created_at, @updated_at, NULL)`,
      ).run({
        id: uuidv4(),
        tenant_id: tenantId,
        return_id: id,
        booking_line_id: line.booking_line_id,
        item_id: line.item_id,
        item_unit_id: line.item_unit_id ?? null,
        condition: line.condition,
        severity: line.severity ?? null,
        quantity: line.quantity,
        description: line.description ?? null,
        charge_pesewas: line.charge_pesewas,
        write_off: line.write_off ? 1 : 0,
        created_at: now,
        updated_at: now,
      });

      if (line.item_unit_id && (line.condition === 'damaged' || line.condition === 'lost' || line.write_off)) {
        db.prepare(
          `UPDATE item_units
           SET current_status = @status, updated_at = @updated_at
           WHERE id = @id AND tenant_id = @tenant_id`,
        ).run({
          id: line.item_unit_id,
          tenant_id: tenantId,
          status: line.write_off || line.condition === 'lost' ? 'retired' : 'damaged',
          updated_at: now,
        });
      }
    }

    db.prepare(`UPDATE bookings SET status = 'returned', updated_at = @t WHERE id = @id AND tenant_id = @tenant_id`)
      .run({ id: input.booking_id, tenant_id: tenantId, t: now });

    postOnce(db, tenantId, buildReturnReconciledEntry({
      entry_date: toEntryDate(input.returned_at),
      return_id: id,
      customer_deposits_account_id: resolveAccount(db, tenantId, 'customer_deposits'),
      ar_account_id: resolveAccount(db, tenantId, 'ar'),
      damage_recovery_account_id: resolveAccount(db, tenantId, 'income.damage_recovery'),
      deposit_pesewas: reconciliation.deposit_pesewas,
      total_charges_pesewas: reconciliation.total_charges_pesewas,
      customer_id: booking.customer_id,
    }));
  });
  tx();

  const created = getReturn(db, tenantId, id);
  if (!created) throw new Error('createReturn: readback failed');
  return created;
}

export function attachDamagePhoto(
  db: Database,
  tenantId: string,
  damageLineId: string,
  storagePath: string,
  caption: string | null,
): DamagePhoto {
  const id = uuidv4();
  const now = nowIso();
  db.prepare(
    `INSERT INTO damage_photos (${PHOTO_COLS})
     VALUES (@id, @tenant_id, @damage_line_id, @storage_path, @caption, @created_at)`,
  ).run({
    id,
    tenant_id: tenantId,
    damage_line_id: damageLineId,
    storage_path: storagePath,
    caption,
    created_at: now,
  });
  return db.prepare(`SELECT ${PHOTO_COLS} FROM damage_photos WHERE id = @id`).get({ id }) as DamagePhoto;
}

function normalizeDamageRows(rows: DamageLine[]): DamageLine[] {
  return rows.map((row) => ({ ...row, write_off: Boolean(row.write_off) }));
}
