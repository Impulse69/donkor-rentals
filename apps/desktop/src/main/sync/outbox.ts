import type { Database } from 'better-sqlite3';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SyncStatus } from '@shared/schemas';
import { isSupabaseConfigured } from '../supabase/client';

interface OutboxRow {
  id: string;
  table_name: string;
  payload: string;
}

export function getSyncStatus(db: Database): SyncStatus {
  const pending = db.prepare(`SELECT COUNT(*) AS n FROM outbox WHERE status = 'pending'`).get() as { n: number };
  const failed = db.prepare(`SELECT COUNT(*) AS n FROM outbox WHERE status = 'failed'`).get() as { n: number };
  const last = db
    .prepare(`SELECT delivered_at FROM outbox WHERE delivered_at IS NOT NULL ORDER BY delivered_at DESC LIMIT 1`)
    .get() as { delivered_at: string } | undefined;
  const error = db
    .prepare(`SELECT last_error FROM outbox WHERE status = 'failed' ORDER BY created_at DESC LIMIT 1`)
    .get() as { last_error: string | null } | undefined;

  return {
    configured: isSupabaseConfigured(),
    online: isSupabaseConfigured() && failed.n === 0,
    pending: pending.n,
    failed: failed.n,
    lastSyncedAt: last?.delivered_at ?? null,
    lastError: error?.last_error ?? null,
  };
}

export async function drainOutbox(db: Database, client: SupabaseClient | null): Promise<SyncStatus> {
  if (!client) return getSyncStatus(db);

  const rows = db
    .prepare(
      `SELECT id, table_name, payload
       FROM outbox
       WHERE status IN ('pending', 'failed')
       ORDER BY created_at ASC
       LIMIT 100`,
    )
    .all() as OutboxRow[];

  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload) as Record<string, unknown>;
      const { error } = await client.from(row.table_name).upsert(payload, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      db.prepare(
        `UPDATE outbox
         SET status = 'synced', delivered_at = @t, last_error = NULL
         WHERE id = @id`,
      ).run({ id: row.id, t: new Date().toISOString() });
    } catch (err) {
      db.prepare(
        `UPDATE outbox
         SET status = 'failed', attempt_count = attempt_count + 1, last_error = @message
         WHERE id = @id`,
      ).run({ id: row.id, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return getSyncStatus(db);
}

export function retryFailedOutbox(db: Database): void {
  db.prepare(`UPDATE outbox SET status = 'pending', last_error = NULL WHERE status = 'failed'`).run();
}
