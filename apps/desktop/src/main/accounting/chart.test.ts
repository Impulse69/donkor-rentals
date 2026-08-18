import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AccountMappingKey } from '@shared/schemas';
import { ensureChartOfAccounts, resolveAccount, resolveCashAccount } from './chart';

/**
 * Builds the schema straight from the shipped migration files.
 *
 * openMemoryDb() cannot be used here: it reads app.isPackaged, and under the
 * Electron-as-Node test runner require('electron') resolves to the executable
 * path rather than the API. Its migrationsDir() is also tuned for the bundled
 * out/main layout, so it does not resolve from source anyway. Reading the SQL
 * directly also keeps the test honest about which schema it covers.
 */
const MIGRATIONS = join(__dirname, '..', '..', '..', '..', '..', 'packages', 'db', 'sqlite', 'migrations');
const TENANT = '00000000-0000-4000-8000-000000000001';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  // Apply every shipped migration in order, exactly as the real runner does.
  // A hardcoded list here silently pins tests to an old schema the moment a
  // migration lands.
  for (const file of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  }
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tenants (id, name, currency, locale, created_at, updated_at)
     VALUES (?, 'Donkor and Sons', 'GHS', 'en-GB', ?, ?)`,
  ).run(TENANT, now, now);
  return db;
}

describe('ensureChartOfAccounts', () => {
  it('seeds the chart and is idempotent', () => {
    const db = makeDb();

    ensureChartOfAccounts(db, TENANT);
    const first = (db.prepare('SELECT COUNT(*) AS n FROM accounts WHERE tenant_id = ?').get(TENANT) as { n: number }).n;
    expect(first).toBeGreaterThan(40);

    ensureChartOfAccounts(db, TENANT);
    const second = (db.prepare('SELECT COUNT(*) AS n FROM accounts WHERE tenant_id = ?').get(TENANT) as { n: number }).n;
    expect(second).toBe(first);

    db.close();
  });

  it('resolves every mapping key the posting layer will need', () => {
    const db = makeDb();
    ensureChartOfAccounts(db, TENANT);

    const keys = (db
      .prepare('SELECT mapping_key FROM account_templates WHERE mapping_key IS NOT NULL')
      .all() as Array<{ mapping_key: AccountMappingKey }>).map((r) => r.mapping_key);

    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(resolveAccount(db, TENANT, key)).toMatch(/^[0-9a-f-]{36}$/i);
    }

    for (const method of ['cash', 'mobile_money', 'bank', 'card', 'other'] as const) {
      expect(resolveCashAccount(db, TENANT, method)).toMatch(/^[0-9a-f-]{36}$/i);
    }

    db.close();
  });

  it('cannot be reached by a non-GHS tenant, because the schema forbids one', () => {
    const db = makeDb();
    const now = new Date().toISOString();

    // chart.ts also asserts GHS, but that guard is belt-and-braces: the tenants
    // table carries CHECK (currency = 'GHS'), so a foreign-currency tenant is
    // unrepresentable rather than merely rejected downstream. Multi-currency is
    // explicitly out of scope, and this pins the reason.
    expect(() =>
      db.prepare('UPDATE tenants SET currency = ? WHERE id = ?').run('USD', TENANT),
    ).toThrow();
    expect(() =>
      db
        .prepare(
          `INSERT INTO tenants (id, name, currency, locale, created_at, updated_at)
           VALUES ('t-usd', 'Elsewhere Ltd', 'USD', 'en-GB', ?, ?)`,
        )
        .run(now, now),
    ).toThrow();

    db.close();
  });

  it('does not clobber an operator who re-points a mapping', () => {
    const db = makeDb();
    ensureChartOfAccounts(db, TENANT);

    const bank = resolveAccount(db, TENANT, 'cash.bank' as AccountMappingKey);
    const cash = resolveAccount(db, TENANT, 'cash.cash' as AccountMappingKey);
    expect(bank).not.toBe(cash);

    db.prepare('UPDATE account_mappings SET account_id = ? WHERE tenant_id = ? AND key = ?')
      .run(cash, TENANT, 'cash.bank');
    ensureChartOfAccounts(db, TENANT);

    expect(resolveAccount(db, TENANT, 'cash.bank' as AccountMappingKey)).toBe(cash);
    db.close();
  });
});

describe('accounting schema constraints', () => {
  it('makes a malformed journal line unrepresentable', () => {
    const db = makeDb();
    ensureChartOfAccounts(db, TENANT);
    const account = resolveAccount(db, TENANT, 'ar' as AccountMappingKey);
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO journal_entries (id, tenant_id, entry_no, entry_date, status, origin,
        source_type, source_id, source_event, source_key, posting_version, created_at, updated_at)
       VALUES ('e1', ?, 'JE-000001', '2026-08-18', 'posted', 'manual',
        'manual', 'e1', 'manual', 'manual:e1:manual', 1, ?, ?)`,
    ).run(TENANT, now, now);

    const line = (id: string, lineNo: number, debit: number, credit: number): void => {
      db.prepare(
        `INSERT INTO journal_lines (id, tenant_id, entry_id, line_no, account_id,
          debit_pesewas, credit_pesewas, created_at)
         VALUES (?, ?, 'e1', ?, ?, ?, ?, ?)`,
      ).run(id, TENANT, lineNo, account, debit, credit, now);
    };

    expect(() => line('l1', 1, 500, 500)).toThrow();
    expect(() => line('l2', 2, 0, 0)).toThrow();
    expect(() => line('l3', 3, -500, 0)).toThrow();
    expect(() => line('l4', 4, 500, 0)).not.toThrow();

    db.close();
  });

  it('rejects an account whose normal balance contradicts its type', () => {
    const db = makeDb();
    const now = new Date().toISOString();
    const insert = (code: string, type: string, normal: string): void => {
      db.prepare(
        `INSERT INTO accounts (id, tenant_id, code, name, account_type, detail_type,
          classification, normal_balance, is_active, is_system, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, 'X', ?, 'other_current_asset', 'current_asset', ?, 1, 0, 0, ?, ?)`,
      ).run(`a-${code}`, TENANT, code, type, normal, now, now);
    };

    expect(() => insert('9001', 'asset', 'credit')).toThrow();
    expect(() => insert('9002', 'income', 'debit')).toThrow();
    expect(() => insert('9003', 'asset', 'debit')).not.toThrow();

    db.close();
  });

  it('enforces one journal entry per business event', () => {
    const db = makeDb();
    const now = new Date().toISOString();
    const entry = (id: string, no: string): void => {
      db.prepare(
        `INSERT INTO journal_entries (id, tenant_id, entry_no, entry_date, status, origin,
          source_type, source_id, source_event, source_key, posting_version, created_at, updated_at)
         VALUES (?, ?, ?, '2026-08-18', 'posted', 'auto',
          'invoice', 'inv-1', 'issued', 'invoice:inv-1:issued', 1, ?, ?)`,
      ).run(id, TENANT, no, now, now);
    };

    entry('e1', 'JE-000001');
    expect(() => entry('e2', 'JE-000002')).toThrow();

    db.close();
  });
});
