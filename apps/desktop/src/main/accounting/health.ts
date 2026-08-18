import type { Database } from 'better-sqlite3';

export function everyEntryBalances(db: Database, tenantId: string): Array<{ entry_id: string; debit_pesewas: number; credit_pesewas: number }> {
  return db
    .prepare(
      `SELECT e.id AS entry_id,
              COALESCE(SUM(l.debit_pesewas), 0) AS debit_pesewas,
              COALESCE(SUM(l.credit_pesewas), 0) AS credit_pesewas
       FROM journal_entries e
       JOIN journal_lines l ON l.entry_id = e.id
       WHERE e.tenant_id = @tenant_id
       GROUP BY e.id
       HAVING debit_pesewas <> credit_pesewas`,
    )
    .all({ tenant_id: tenantId }) as Array<{ entry_id: string; debit_pesewas: number; credit_pesewas: number }>;
}

export function arTiesToSubLedger(db: Database, tenantId: string, asOf: string): { gl_pesewas: number; subledger_pesewas: number; delta_pesewas: number } {
  const gl = db
    .prepare(
      `SELECT COALESCE(SUM(l.debit_pesewas - l.credit_pesewas), 0) AS n
       FROM journal_lines l
       JOIN journal_entries e ON e.id = l.entry_id
       JOIN account_mappings m ON m.tenant_id = l.tenant_id AND m.account_id = l.account_id AND m.key = 'ar'
       WHERE l.tenant_id = @tenant_id AND e.entry_date <= @as_of`,
    )
    .get({ tenant_id: tenantId, as_of: asOf }) as { n: number };
  const subledger = db
    .prepare(
      `SELECT COALESCE(SUM(i.total_pesewas - COALESCE((
         SELECT SUM(CASE WHEN p.kind = 'refund' THEN -p.amount_pesewas ELSE p.amount_pesewas END)
         FROM payments p
         WHERE p.invoice_id = i.id AND p.deleted_at IS NULL AND substr(p.paid_at, 1, 10) <= @as_of
       ), 0)), 0) AS n
       FROM invoices i
       WHERE i.tenant_id = @tenant_id
         AND i.deleted_at IS NULL
         AND i.status IN ('issued', 'paid')
         AND substr(COALESCE(i.issued_at, i.created_at), 1, 10) <= @as_of`,
    )
    .get({ tenant_id: tenantId, as_of: asOf }) as { n: number };
  return { gl_pesewas: gl.n, subledger_pesewas: subledger.n, delta_pesewas: gl.n - subledger.n };
}

export function depositsNeverNegative(db: Database, tenantId: string): { balance_pesewas: number; ok: boolean } {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(l.credit_pesewas - l.debit_pesewas), 0) AS n
       FROM journal_lines l
       JOIN account_mappings m ON m.tenant_id = l.tenant_id AND m.account_id = l.account_id AND m.key = 'customer_deposits'
       WHERE l.tenant_id = @tenant_id`,
    )
    .get({ tenant_id: tenantId }) as { n: number };
  return { balance_pesewas: row.n, ok: row.n >= 0 };
}

export function unpostedEvents(db: Database, tenantId: string): Array<{ source_type: string; source_id: string; source_event: string }> {
  return db
    .prepare(
      `SELECT 'invoice' AS source_type, i.id AS source_id, 'issued' AS source_event
       FROM invoices i
       WHERE i.tenant_id = @tenant_id AND i.deleted_at IS NULL AND i.status IN ('issued', 'paid')
         AND NOT EXISTS (SELECT 1 FROM journal_entries e WHERE e.tenant_id = i.tenant_id AND e.source_key = 'invoice:' || i.id || ':issued')
       UNION ALL
       SELECT 'payment', p.id,
              CASE WHEN p.kind = 'payment' THEN 'received'
                   WHEN p.kind = 'refund' THEN 'refunded'
                   ELSE 'deposit_received' END
       FROM payments p
       WHERE p.tenant_id = @tenant_id AND p.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM journal_entries e
           WHERE e.tenant_id = p.tenant_id
             AND e.source_key = 'payment:' || p.id || ':' ||
               CASE WHEN p.kind = 'payment' THEN 'received'
                    WHEN p.kind = 'refund' THEN 'refunded'
                    ELSE 'deposit_received' END
         )
       UNION ALL
       SELECT 'return', r.id, 'reconciled'
       FROM returns r
       WHERE r.tenant_id = @tenant_id AND r.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM journal_entries e WHERE e.tenant_id = r.tenant_id AND e.source_key = 'return:' || r.id || ':reconciled')`,
    )
    .all({ tenant_id: tenantId }) as Array<{ source_type: string; source_id: string; source_event: string }>;
}
