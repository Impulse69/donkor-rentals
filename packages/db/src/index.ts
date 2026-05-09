/**
 * Migration manifest. Phase 0 ships an empty list. Phase 1 adds 0001_init for
 * items, customers; Phase 2 adds bookings; Phase 3 adds contracts/invoices/payments;
 * Phase 4 adds outbox + sync_conflicts.
 *
 * SQLite migrations live at packages/db/sqlite/migrations/*.sql.
 * Supabase migrations live at supabase/migrations/*.sql (mirroring the SQLite shape
 * with tenant_id + RLS policies).
 */

export interface Migration {
  id: string; // e.g. "0001_init"
  sql: string;
}

export const sqliteMigrations: ReadonlyArray<Migration> = [];
