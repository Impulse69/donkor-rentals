import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { AccountMappingKey, PaymentMethod } from '@shared/schemas';

function nowIso(): string {
  return new Date().toISOString();
}

function assertGhsTenant(db: Database, tenantId: string): void {
  const row = db
    .prepare('SELECT currency FROM tenants WHERE id = @tenant_id')
    .get({ tenant_id: tenantId }) as { currency: string } | undefined;
  if (!row) throw new Error(`ensureChartOfAccounts: tenant ${tenantId} not found`);
  if (row.currency !== 'GHS') {
    throw new Error(`ensureChartOfAccounts: tenant ${tenantId} uses ${row.currency}; only GHS is supported`);
  }
}

export function ensureChartOfAccounts(db: Database, tenantId: string): void {
  const tx = db.transaction(() => {
    assertGhsTenant(db, tenantId);
    const now = nowIso();
    const templates = db
      .prepare(
        `SELECT code, name, account_type, detail_type, classification, normal_balance,
                system_key, is_system, sort_order, description
         FROM account_templates
         ORDER BY sort_order ASC, code ASC`,
      )
      .all() as Array<{
      code: string;
      name: string;
      account_type: string;
      detail_type: string;
      classification: string;
      normal_balance: string;
      system_key: string | null;
      is_system: number;
      sort_order: number;
      description: string | null;
    }>;

    const insertAccount = db.prepare(
      `INSERT INTO accounts (
         id, tenant_id, code, name, description, account_type, detail_type, classification,
         normal_balance, parent_id, system_key, is_active, is_system, sort_order,
         created_at, updated_at, deleted_at
       )
       VALUES (
         @id, @tenant_id, @code, @name, @description, @account_type, @detail_type, @classification,
         @normal_balance, NULL, @system_key, 1, @is_system, @sort_order,
         @created_at, @updated_at, NULL
       )
       ON CONFLICT(tenant_id, code) DO NOTHING`,
    );

    for (const template of templates) {
      insertAccount.run({
        id: uuidv4(),
        tenant_id: tenantId,
        ...template,
        created_at: now,
        updated_at: now,
      });
    }

    db.prepare(
      `INSERT INTO account_mappings (tenant_id, key, account_id, updated_at)
       SELECT @tenant_id, t.mapping_key, a.id, @updated_at
       FROM account_templates t
       JOIN accounts a ON a.tenant_id = @tenant_id AND a.code = t.code
       WHERE t.mapping_key IS NOT NULL
       ON CONFLICT(tenant_id, key) DO NOTHING`,
    ).run({ tenant_id: tenantId, updated_at: now });

    db.prepare(
      `INSERT OR IGNORE INTO accounting_settings (
         tenant_id, fiscal_year_start_month, books_closed_through,
         vat_registered, posting_version, created_at, updated_at
       )
       VALUES (@tenant_id, 1, NULL, 1, 1, @created_at, @updated_at)`,
    ).run({ tenant_id: tenantId, created_at: now, updated_at: now });
  });

  tx();
}

export function resolveAccount(db: Database, tenantId: string, mappingKey: AccountMappingKey): string {
  const row = db
    .prepare(
      `SELECT account_id
       FROM account_mappings
       WHERE tenant_id = @tenant_id AND key = @key`,
    )
    .get({ tenant_id: tenantId, key: mappingKey }) as { account_id: string } | undefined;
  if (!row) throw new Error(`Missing accounting account mapping: ${mappingKey}`);
  return row.account_id;
}

export function resolveCashAccount(db: Database, tenantId: string, method: PaymentMethod): string {
  return resolveAccount(db, tenantId, `cash.${method}`);
}
