import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import {
  type Item,
  type ItemCreateInput,
  type ItemUpdateInput,
  type ItemFilter,
  type ItemUnit,
  type ItemUnitCreateInput,
  type ItemUnitUpdateInput,
} from '@shared/schemas';

const ITEM_COLUMNS = `id, tenant_id, kind, sku, name, description,
  daily_rate_pesewas, replacement_value_pesewas, total_quantity,
  status, created_at, updated_at, deleted_at`;

const UNIT_COLUMNS = `id, tenant_id, item_id, identifier, vin, plate, odometer_km,
  current_status, notes, created_at, updated_at, deleted_at`;

function nowIso(): string {
  return new Date().toISOString();
}

export function listItems(db: Database, tenantId: string, filter: ItemFilter = {}): Item[] {
  const params: Record<string, unknown> = { tenant_id: tenantId };
  let sql = `SELECT ${ITEM_COLUMNS} FROM items WHERE tenant_id = @tenant_id`;
  if (!filter.includeDeleted) sql += ' AND deleted_at IS NULL';
  if (filter.kind) {
    sql += ' AND kind = @kind';
    params.kind = filter.kind;
  }
  if (filter.status) {
    sql += ' AND status = @status';
    params.status = filter.status;
  }
  if (filter.search && filter.search.length > 0) {
    sql += ' AND (name LIKE @q OR sku LIKE @q)';
    params.q = `%${filter.search}%`;
  }
  sql += ' ORDER BY name ASC';
  return db.prepare(sql).all(params) as Item[];
}

export function getItem(db: Database, tenantId: string, id: string): Item | null {
  return (
    (db
      .prepare(`SELECT ${ITEM_COLUMNS} FROM items WHERE id = @id AND tenant_id = @tenant_id`)
      .get({ id, tenant_id: tenantId }) as Item | undefined) ?? null
  );
}

export function createItem(db: Database, tenantId: string, input: ItemCreateInput): Item {
  const id = uuidv4();
  const now = nowIso();
  db.prepare(
    `INSERT INTO items
       (${ITEM_COLUMNS})
     VALUES
       (@id, @tenant_id, @kind, @sku, @name, @description,
        @daily_rate_pesewas, @replacement_value_pesewas, @total_quantity,
        @status, @created_at, @updated_at, NULL)`,
  ).run({
    id,
    tenant_id: tenantId,
    kind: input.kind,
    sku: input.sku,
    name: input.name,
    description: input.description ?? null,
    daily_rate_pesewas: input.daily_rate_pesewas,
    replacement_value_pesewas: input.replacement_value_pesewas,
    total_quantity: input.total_quantity,
    status: input.status,
    created_at: now,
    updated_at: now,
  });
  const created = getItem(db, tenantId, id);
  if (!created) throw new Error('createItem: insert succeeded but readback returned null');
  return created;
}

export function updateItem(
  db: Database,
  tenantId: string,
  id: string,
  patch: ItemUpdateInput,
): Item {
  const existing = getItem(db, tenantId, id);
  if (!existing) throw new Error(`updateItem: item ${id} not found`);
  const merged = { ...existing, ...patch, updated_at: nowIso() };
  db.prepare(
    `UPDATE items SET
       kind = @kind, sku = @sku, name = @name, description = @description,
       daily_rate_pesewas = @daily_rate_pesewas,
       replacement_value_pesewas = @replacement_value_pesewas,
       total_quantity = @total_quantity, status = @status,
       updated_at = @updated_at
     WHERE id = @id AND tenant_id = @tenant_id`,
  ).run({
    id,
    tenant_id: tenantId,
    kind: merged.kind,
    sku: merged.sku,
    name: merged.name,
    description: merged.description ?? null,
    daily_rate_pesewas: merged.daily_rate_pesewas,
    replacement_value_pesewas: merged.replacement_value_pesewas,
    total_quantity: merged.total_quantity,
    status: merged.status,
    updated_at: merged.updated_at,
  });
  const after = getItem(db, tenantId, id);
  if (!after) throw new Error('updateItem: readback failed');
  return after;
}

export function softDeleteItem(db: Database, tenantId: string, id: string): void {
  db.prepare(
    `UPDATE items SET deleted_at = @t, updated_at = @t
     WHERE id = @id AND tenant_id = @tenant_id AND deleted_at IS NULL`,
  ).run({ id, tenant_id: tenantId, t: nowIso() });
}

export function restoreItem(db: Database, tenantId: string, id: string): void {
  db.prepare(
    `UPDATE items SET deleted_at = NULL, updated_at = @t
     WHERE id = @id AND tenant_id = @tenant_id`,
  ).run({ id, tenant_id: tenantId, t: nowIso() });
}

// Item units (hearses) ---

export function listUnits(db: Database, tenantId: string, itemId: string): ItemUnit[] {
  return db
    .prepare(
      `SELECT ${UNIT_COLUMNS} FROM item_units
       WHERE tenant_id = @tenant_id AND item_id = @item_id AND deleted_at IS NULL
       ORDER BY identifier ASC`,
    )
    .all({ tenant_id: tenantId, item_id: itemId }) as ItemUnit[];
}

export function createUnit(
  db: Database,
  tenantId: string,
  itemId: string,
  input: ItemUnitCreateInput,
): ItemUnit {
  const id = uuidv4();
  const now = nowIso();
  db.prepare(
    `INSERT INTO item_units (${UNIT_COLUMNS})
     VALUES (@id, @tenant_id, @item_id, @identifier, @vin, @plate, @odometer_km,
             @current_status, @notes, @created_at, @updated_at, NULL)`,
  ).run({
    id,
    tenant_id: tenantId,
    item_id: itemId,
    identifier: input.identifier,
    vin: input.vin ?? null,
    plate: input.plate ?? null,
    odometer_km: input.odometer_km ?? null,
    current_status: input.current_status,
    notes: input.notes ?? null,
    created_at: now,
    updated_at: now,
  });
  const row = db
    .prepare(`SELECT ${UNIT_COLUMNS} FROM item_units WHERE id = @id`)
    .get({ id }) as ItemUnit | undefined;
  if (!row) throw new Error('createUnit: readback failed');
  return row;
}

export function updateUnit(
  db: Database,
  tenantId: string,
  id: string,
  patch: ItemUnitUpdateInput,
): ItemUnit {
  const existing = db
    .prepare(`SELECT ${UNIT_COLUMNS} FROM item_units WHERE id = @id AND tenant_id = @tenant_id`)
    .get({ id, tenant_id: tenantId }) as ItemUnit | undefined;
  if (!existing) throw new Error(`updateUnit: unit ${id} not found`);
  const merged = { ...existing, ...patch, updated_at: nowIso() };
  db.prepare(
    `UPDATE item_units SET
       identifier = @identifier, vin = @vin, plate = @plate,
       odometer_km = @odometer_km, current_status = @current_status,
       notes = @notes, updated_at = @updated_at
     WHERE id = @id AND tenant_id = @tenant_id`,
  ).run({
    id,
    tenant_id: tenantId,
    identifier: merged.identifier,
    vin: merged.vin ?? null,
    plate: merged.plate ?? null,
    odometer_km: merged.odometer_km ?? null,
    current_status: merged.current_status,
    notes: merged.notes ?? null,
    updated_at: merged.updated_at,
  });
  const after = db
    .prepare(`SELECT ${UNIT_COLUMNS} FROM item_units WHERE id = @id`)
    .get({ id }) as ItemUnit | undefined;
  if (!after) throw new Error('updateUnit: readback failed');
  return after;
}

export function softDeleteUnit(db: Database, tenantId: string, id: string): void {
  db.prepare(
    `UPDATE item_units SET deleted_at = @t, updated_at = @t
     WHERE id = @id AND tenant_id = @tenant_id AND deleted_at IS NULL`,
  ).run({ id, tenant_id: tenantId, t: nowIso() });
}
