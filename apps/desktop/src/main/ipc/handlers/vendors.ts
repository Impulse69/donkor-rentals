import { ipcMain } from 'electron';
import { z } from 'zod';
import { VendorCreateInput, VendorFilter, VendorUpdateInput, Uuid, type Vendor } from '@shared/schemas';
import { wrap } from '../envelope';
import { ensureBootstrapTenant, getDb } from '../../db';
import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

const COLUMNS = 'id, tenant_id, name, phone, email, tin, address, notes, default_expense_account_id, created_at, updated_at, deleted_at';
const nowIso = (): string => new Date().toISOString();
function tenant(): string { return ensureBootstrapTenant(getDb()); }

function list(db: Database, tenantId: string, filter: z.infer<typeof VendorFilter> = {}): Vendor[] {
  const params: Record<string, unknown> = { tenant_id: tenantId };
  let sql = `SELECT ${COLUMNS} FROM vendors WHERE tenant_id = @tenant_id`;
  if (!filter.includeDeleted) sql += ' AND deleted_at IS NULL';
  if (filter.search) { sql += ' AND (name LIKE @q OR phone LIKE @q OR email LIKE @q OR tin LIKE @q)'; params.q = `%${filter.search}%`; }
  return db.prepare(`${sql} ORDER BY name ASC`).all(params) as Vendor[];
}
function get(db: Database, tenantId: string, id: string): Vendor | null {
  return (db.prepare(`SELECT ${COLUMNS} FROM vendors WHERE id = @id AND tenant_id = @tenant_id`).get({ id, tenant_id: tenantId }) as Vendor | undefined) ?? null;
}
function create(db: Database, tenantId: string, input: z.infer<typeof VendorCreateInput>): Vendor {
  const id = uuidv4(); const now = nowIso();
  db.prepare(`INSERT INTO vendors (${COLUMNS}) VALUES (@id,@tenant_id,@name,@phone,@email,@tin,@address,@notes,@default_expense_account_id,@created_at,@updated_at,NULL)`)
    .run({ id, tenant_id: tenantId, ...input, phone: input.phone ?? null, email: input.email ?? null, tin: input.tin ?? null, address: input.address ?? null, notes: input.notes ?? null, default_expense_account_id: input.default_expense_account_id ?? null, created_at: now, updated_at: now });
  const row = get(db, tenantId, id); if (!row) throw new Error('createVendor: readback failed'); return row;
}
function update(db: Database, tenantId: string, id: string, patch: z.infer<typeof VendorUpdateInput>): Vendor {
  const existing = get(db, tenantId, id); if (!existing) throw new Error(`updateVendor: vendor ${id} not found`);
  const merged = { ...existing, ...patch, updated_at: nowIso() };
  db.prepare(`UPDATE vendors SET name=@name, phone=@phone, email=@email, tin=@tin, address=@address, notes=@notes, default_expense_account_id=@default_expense_account_id, updated_at=@updated_at WHERE id=@id AND tenant_id=@tenant_id`)
    .run({ id, tenant_id: tenantId, name: merged.name, phone: merged.phone ?? null, email: merged.email ?? null, tin: merged.tin ?? null, address: merged.address ?? null, notes: merged.notes ?? null, default_expense_account_id: merged.default_expense_account_id ?? null, updated_at: merged.updated_at });
  const row = get(db, tenantId, id); if (!row) throw new Error('updateVendor: readback failed'); return row;
}
function softDelete(db: Database, tenantId: string, id: string): void {
  db.prepare('UPDATE vendors SET deleted_at=@t, updated_at=@t WHERE id=@id AND tenant_id=@tenant_id AND deleted_at IS NULL').run({ id, tenant_id: tenantId, t: nowIso() });
}

export function registerVendorsIpc(): void {
  ipcMain.handle('vendors:list', wrap('vendors:list', VendorFilter.optional().default({}), (filter) => list(getDb(), tenant(), filter ?? {})));
  ipcMain.handle('vendors:get', wrap('vendors:get', z.object({ id: Uuid }), ({ id }) => get(getDb(), tenant(), id)));
  ipcMain.handle('vendors:create', wrap('vendors:create', VendorCreateInput, (input) => create(getDb(), tenant(), input)));
  ipcMain.handle('vendors:update', wrap('vendors:update', z.object({ id: Uuid, patch: VendorUpdateInput }), ({ id, patch }) => update(getDb(), tenant(), id, patch)));
  ipcMain.handle('vendors:softDelete', wrap('vendors:softDelete', z.object({ id: Uuid }), ({ id }) => { softDelete(getDb(), tenant(), id); return { id }; }));
}
