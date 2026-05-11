import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { resolveIncomingChange, type IncomingSyncChange } from '@shared/sync';
import type { SyncConflict } from '@shared/schemas';

const TRACKED_TABLES = new Set([
  'items',
  'item_units',
  'customers',
  'bookings',
  'booking_lines',
  'invoices',
  'invoice_lines',
  'payments',
  'returns',
  'damage_lines',
  'damage_photos',
  'documents',
]);

interface InboxRow {
  id: string;
  tenant_id: string;
  table_name: string;
  op: 'upsert' | 'delete';
  record_id: string;
  payload: string;
  updated_at: string;
}

export function enqueueIncomingChange(db: Database, change: Omit<InboxRow, 'payload'> & { payload: Record<string, unknown> }): void {
  assertTracked(change.table_name);
  db.prepare(
    `INSERT INTO changes_inbox
      (id, tenant_id, table_name, op, record_id, payload, updated_at, created_at)
     VALUES (@id, @tenant_id, @table_name, @op, @record_id, @payload, @updated_at, @created_at)
     ON CONFLICT(id) DO NOTHING`,
  ).run({
    ...change,
    payload: JSON.stringify(change.payload),
    created_at: new Date().toISOString(),
  });
}

export function applyInbox(db: Database, tenantId: string): number {
  const rows = db
    .prepare(
      `SELECT id, tenant_id, table_name, op, record_id, payload, updated_at
       FROM changes_inbox
       WHERE tenant_id = @tenant_id AND applied_at IS NULL
       ORDER BY created_at ASC
       LIMIT 100`,
    )
    .all({ tenant_id: tenantId }) as InboxRow[];

  let applied = 0;
  const tx = db.transaction((row: InboxRow) => {
    assertTracked(row.table_name);
    const remotePayload = JSON.parse(row.payload) as Record<string, unknown>;
    const localPayload = readLocalPayload(db, row.table_name, row.record_id);
    const incoming: IncomingSyncChange = {
      id: row.id,
      table_name: row.table_name,
      record_id: row.record_id,
      op: row.op,
      updated_at: row.updated_at,
      payload: remotePayload,
    };
    const resolution = resolveIncomingChange(
      localPayload
        ? {
            id: row.record_id,
            updated_at: String(localPayload.updated_at),
            payload: localPayload,
          }
        : null,
      incoming,
    );

    if (resolution.action === 'apply') {
      setSuppressOutbox(db, true);
      try {
        upsertLocalPayload(db, row.table_name, resolution.payload);
      } finally {
        setSuppressOutbox(db, false);
      }
    } else if (resolution.action === 'conflict') {
      db.prepare(
        `INSERT INTO sync_conflicts
          (id, tenant_id, table_name, record_id, local_payload, remote_payload,
           local_updated_at, remote_updated_at, status, created_at, resolved_at)
         VALUES (@id, @tenant_id, @table_name, @record_id, @local_payload, @remote_payload,
           @local_updated_at, @remote_updated_at, 'open', @created_at, NULL)`,
      ).run({
        id: uuidv4(),
        tenant_id: tenantId,
        table_name: resolution.conflict.table_name,
        record_id: resolution.conflict.record_id,
        local_payload: JSON.stringify(resolution.conflict.local_payload),
        remote_payload: JSON.stringify(resolution.conflict.remote_payload),
        local_updated_at: resolution.conflict.local_updated_at,
        remote_updated_at: resolution.conflict.remote_updated_at,
        created_at: new Date().toISOString(),
      });
    }

    db.prepare(`UPDATE changes_inbox SET applied_at = @t WHERE id = @id`).run({
      id: row.id,
      t: new Date().toISOString(),
    });
  });

  for (const row of rows) {
    tx(row);
    applied += 1;
  }
  return applied;
}

export function listConflicts(db: Database, tenantId: string): SyncConflict[] {
  return db
    .prepare(
      `SELECT id, tenant_id, table_name, record_id, local_payload, remote_payload,
              local_updated_at, remote_updated_at, status, created_at, resolved_at
       FROM sync_conflicts
       WHERE tenant_id = @tenant_id
       ORDER BY status ASC, created_at DESC`,
    )
    .all({ tenant_id: tenantId }) as SyncConflict[];
}

export function resolveConflict(
  db: Database,
  tenantId: string,
  id: string,
  resolution: 'local' | 'remote',
): SyncConflict {
  const row = db
    .prepare(`SELECT * FROM sync_conflicts WHERE id = @id AND tenant_id = @tenant_id`)
    .get({ id, tenant_id: tenantId }) as SyncConflict | undefined;
  if (!row) throw new Error('Conflict not found');

  if (resolution === 'remote') {
    const payload = JSON.parse(row.remote_payload) as Record<string, unknown>;
    setSuppressOutbox(db, true);
    try {
      upsertLocalPayload(db, row.table_name, payload);
    } finally {
      setSuppressOutbox(db, false);
    }
  }

  db.prepare(
    `UPDATE sync_conflicts
     SET status = @status, resolved_at = @resolved_at
     WHERE id = @id AND tenant_id = @tenant_id`,
  ).run({
    id,
    tenant_id: tenantId,
    status: resolution === 'local' ? 'resolved_local' : 'resolved_remote',
    resolved_at: new Date().toISOString(),
  });

  return db
    .prepare(`SELECT * FROM sync_conflicts WHERE id = @id AND tenant_id = @tenant_id`)
    .get({ id, tenant_id: tenantId }) as SyncConflict;
}

function readLocalPayload(db: Database, table: string, id: string): Record<string, unknown> | null {
  assertTracked(table);
  return (db.prepare(`SELECT * FROM ${table} WHERE id = @id`).get({ id }) as Record<string, unknown> | undefined) ?? null;
}

function upsertLocalPayload(db: Database, table: string, payload: Record<string, unknown>): void {
  assertTracked(table);
  const entries = Object.entries(payload);
  if (entries.length === 0 || !payload['id']) throw new Error('Remote payload is missing id');
  const columns = entries.map(([key]) => key);
  const placeholders = columns.map((key) => `@${key}`);
  const updates = columns.filter((key) => key !== 'id').map((key) => `${key} = excluded.${key}`);
  db.prepare(
    `INSERT INTO ${table} (${columns.join(', ')})
     VALUES (${placeholders.join(', ')})
     ON CONFLICT(id) DO UPDATE SET ${updates.join(', ')}`,
  ).run(payload);
}

function setSuppressOutbox(db: Database, suppress: boolean): void {
  db.prepare(`UPDATE sync_runtime_flags SET value = @value WHERE key = 'suppress_outbox'`).run({
    value: suppress ? '1' : '0',
  });
}

function assertTracked(table: string): void {
  if (!TRACKED_TABLES.has(table)) throw new Error(`Unsupported sync table: ${table}`);
}
