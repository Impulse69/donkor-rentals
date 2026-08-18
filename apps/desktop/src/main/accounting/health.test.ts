import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ensureChartOfAccounts, resolveAccount } from './chart';
import { arTiesToSubLedger, depositsNeverNegative, everyEntryBalances, unpostedEvents } from './health';

/**
 * These are the ledger's safety net, so each test deliberately BREAKS the books
 * and asserts the check notices. A health check that only ever reports "fine" is
 * worse than no health check: it converts an unknown into false confidence.
 *
 * The rows here are inserted directly, bypassing postOnce — that is the point.
 * postOnce refuses to write an unbalanced entry, so the only way to test the
 * detector is to forge the corruption it exists to find.
 */
const MIGRATIONS = join(__dirname, '..', '..', '..', '..', '..', 'packages', 'db', 'sqlite', 'migrations');
const TENANT = '00000000-0000-4000-8000-000000000001';
const NOW = '2026-03-01T00:00:00.000Z';

let db: Database.Database;

function makeDb(): Database.Database {
  const d = new Database(':memory:');
  d.pragma('foreign_keys = ON');
  for (const f of ['0001_baseline.sql', '0002_accounting.sql']) {
    d.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  }
  d.prepare(
    `INSERT INTO tenants (id, name, currency, locale, created_at, updated_at)
     VALUES (?, 'Donkor', 'GHS', 'en-GB', ?, ?)`,
  ).run(TENANT, NOW, NOW);
  ensureChartOfAccounts(d, TENANT);
  return d;
}

/** Writes a journal entry header directly, bypassing postOnce's assertions. */
function forgeEntry(id: string, no: string, sourceKey: string): void {
  db.prepare(
    `INSERT INTO journal_entries (id, tenant_id, entry_no, entry_date, status, origin,
      source_type, source_id, source_event, source_key, posting_version, created_at, updated_at)
     VALUES (?, ?, ?, '2026-03-01', 'posted', 'manual', 'manual', ?, 'manual', ?, 1, ?, ?)`,
  ).run(id, TENANT, no, id, sourceKey, NOW, NOW);
}

function forgeLine(id: string, entryId: string, lineNo: number, accountId: string, debit: number, credit: number): void {
  db.prepare(
    `INSERT INTO journal_lines (id, tenant_id, entry_id, line_no, account_id,
      debit_pesewas, credit_pesewas, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, TENANT, entryId, lineNo, accountId, debit, credit, NOW);
}

beforeEach(() => {
  db = makeDb();
});

describe('everyEntryBalances', () => {
  it('reports nothing on a clean ledger', () => {
    expect(everyEntryBalances(db, TENANT)).toEqual([]);
  });

  it('catches an entry whose debits and credits disagree', () => {
    const ar = resolveAccount(db, TENANT, 'ar');
    const cash = resolveAccount(db, TENANT, 'cash.cash');
    forgeEntry('e1', 'JE-000001', 'manual:e1:manual');
    forgeLine('l1', 'e1', 1, ar, 10_000, 0);
    forgeLine('l2', 'e1', 2, cash, 0, 9_000); // 1000 short

    const offenders = everyEntryBalances(db, TENANT);
    expect(offenders).toHaveLength(1);
    expect(offenders[0].entry_id).toBe('e1');
    expect(offenders[0].debit_pesewas - offenders[0].credit_pesewas).toBe(1_000);
  });

  it('does not flag a balanced entry sitting alongside a broken one', () => {
    const ar = resolveAccount(db, TENANT, 'ar');
    const cash = resolveAccount(db, TENANT, 'cash.cash');
    forgeEntry('good', 'JE-000001', 'manual:good:manual');
    forgeLine('g1', 'good', 1, ar, 5_000, 0);
    forgeLine('g2', 'good', 2, cash, 0, 5_000);
    forgeEntry('bad', 'JE-000002', 'manual:bad:manual');
    forgeLine('b1', 'bad', 1, ar, 5_000, 0);
    forgeLine('b2', 'bad', 2, cash, 0, 4_000);

    const offenders = everyEntryBalances(db, TENANT);
    expect(offenders.map((o) => o.entry_id)).toEqual(['bad']);
  });
});

describe('depositsNeverNegative', () => {
  it('is satisfied when the liability is untouched', () => {
    expect(depositsNeverNegative(db, TENANT).ok).toBe(true);
  });

  it('catches a debit balance on Customer Deposits Held', () => {
    // This is the real-world shape: a return reconciles a security deposit that
    // was never recorded as received, so the liability is drawn down below zero.
    const deposits = resolveAccount(db, TENANT, 'customer_deposits');
    const income = resolveAccount(db, TENANT, 'income.damage_recovery');
    forgeEntry('e1', 'JE-000001', 'manual:e1:manual');
    forgeLine('l1', 'e1', 1, deposits, 2_000, 0);
    forgeLine('l2', 'e1', 2, income, 0, 2_000);

    const result = depositsNeverNegative(db, TENANT);
    expect(result.ok).toBe(false);
    expect(result.balance_pesewas).toBeLessThan(0);
  });

  it('is satisfied once the deposit was actually received first', () => {
    const deposits = resolveAccount(db, TENANT, 'customer_deposits');
    const cash = resolveAccount(db, TENANT, 'cash.cash');
    const income = resolveAccount(db, TENANT, 'income.damage_recovery');

    forgeEntry('received', 'JE-000001', 'manual:received:manual');
    forgeLine('r1', 'received', 1, cash, 5_000, 0);
    forgeLine('r2', 'received', 2, deposits, 0, 5_000);

    forgeEntry('applied', 'JE-000002', 'manual:applied:manual');
    forgeLine('a1', 'applied', 1, deposits, 2_000, 0);
    forgeLine('a2', 'applied', 2, income, 0, 2_000);

    expect(depositsNeverNegative(db, TENANT).ok).toBe(true);
  });
});

describe('arTiesToSubLedger', () => {
  it('reports no delta when both sides are empty', () => {
    expect(arTiesToSubLedger(db, TENANT, '2026-12-31').delta_pesewas).toBe(0);
  });

  it('catches GL A/R drifting from the invoice sub-ledger', () => {
    // A/R moved in the ledger with no corresponding invoice — exactly the shape
    // that voiding a paid invoice used to produce.
    const ar = resolveAccount(db, TENANT, 'ar');
    const income = resolveAccount(db, TENANT, 'income.default');
    forgeEntry('e1', 'JE-000001', 'manual:e1:manual');
    forgeLine('l1', 'e1', 1, ar, 19_000, 0);
    forgeLine('l2', 'e1', 2, income, 0, 19_000);

    const tie = arTiesToSubLedger(db, TENANT, '2026-12-31');
    expect(tie.gl_pesewas).toBe(19_000);
    expect(tie.subledger_pesewas).toBe(0);
    expect(tie.delta_pesewas).not.toBe(0);
  });
});

describe('unpostedEvents', () => {
  it('reports nothing when there is no business activity', () => {
    expect(unpostedEvents(db, TENANT)).toEqual([]);
  });
});
