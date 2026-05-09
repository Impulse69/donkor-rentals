import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import {
  type Customer,
  type CustomerCreateInput,
  type CustomerUpdateInput,
  type CustomerFilter,
} from '@shared/schemas';

const COLUMNS = `id, tenant_id, name, phone, email, id_type, id_number,
  address, notes, created_at, updated_at, deleted_at`;

function nowIso(): string {
  return new Date().toISOString();
}

export function listCustomers(
  db: Database,
  tenantId: string,
  filter: CustomerFilter = {},
): Customer[] {
  const params: Record<string, unknown> = { tenant_id: tenantId };
  let sql = `SELECT ${COLUMNS} FROM customers WHERE tenant_id = @tenant_id`;
  if (!filter.includeDeleted) sql += ' AND deleted_at IS NULL';
  if (filter.search && filter.search.length > 0) {
    sql += ' AND (name LIKE @q OR phone LIKE @q OR email LIKE @q)';
    params.q = `%${filter.search}%`;
  }
  sql += ' ORDER BY name ASC';
  return db.prepare(sql).all(params) as Customer[];
}

export function getCustomer(db: Database, tenantId: string, id: string): Customer | null {
  return (
    (db
      .prepare(`SELECT ${COLUMNS} FROM customers WHERE id = @id AND tenant_id = @tenant_id`)
      .get({ id, tenant_id: tenantId }) as Customer | undefined) ?? null
  );
}

export function createCustomer(
  db: Database,
  tenantId: string,
  input: CustomerCreateInput,
): Customer {
  const id = uuidv4();
  const now = nowIso();
  db.prepare(
    `INSERT INTO customers (${COLUMNS})
     VALUES (@id, @tenant_id, @name, @phone, @email, @id_type, @id_number,
             @address, @notes, @created_at, @updated_at, NULL)`,
  ).run({
    id,
    tenant_id: tenantId,
    name: input.name,
    phone: input.phone ?? null,
    email: input.email ?? null,
    id_type: input.id_type ?? null,
    id_number: input.id_number ?? null,
    address: input.address ?? null,
    notes: input.notes ?? null,
    created_at: now,
    updated_at: now,
  });
  const created = getCustomer(db, tenantId, id);
  if (!created) throw new Error('createCustomer: readback failed');
  return created;
}

export function updateCustomer(
  db: Database,
  tenantId: string,
  id: string,
  patch: CustomerUpdateInput,
): Customer {
  const existing = getCustomer(db, tenantId, id);
  if (!existing) throw new Error(`updateCustomer: customer ${id} not found`);
  const merged = { ...existing, ...patch, updated_at: nowIso() };
  db.prepare(
    `UPDATE customers SET
       name = @name, phone = @phone, email = @email,
       id_type = @id_type, id_number = @id_number,
       address = @address, notes = @notes, updated_at = @updated_at
     WHERE id = @id AND tenant_id = @tenant_id`,
  ).run({
    id,
    tenant_id: tenantId,
    name: merged.name,
    phone: merged.phone ?? null,
    email: merged.email ?? null,
    id_type: merged.id_type ?? null,
    id_number: merged.id_number ?? null,
    address: merged.address ?? null,
    notes: merged.notes ?? null,
    updated_at: merged.updated_at,
  });
  const after = getCustomer(db, tenantId, id);
  if (!after) throw new Error('updateCustomer: readback failed');
  return after;
}

export function softDeleteCustomer(db: Database, tenantId: string, id: string): void {
  db.prepare(
    `UPDATE customers SET deleted_at = @t, updated_at = @t
     WHERE id = @id AND tenant_id = @tenant_id AND deleted_at IS NULL`,
  ).run({ id, tenant_id: tenantId, t: nowIso() });
}
