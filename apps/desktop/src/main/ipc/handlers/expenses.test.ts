import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ensureChartOfAccounts, resolveAccount } from '../../accounting/chart';
import { postOnce } from '../../accounting/posting';
import { expenseDraft } from './expenses';
import type { Expense, ExpenseLine } from '@shared/schemas';

/**
 * Expense and bill posting had no coverage at all, and it moves money.
 *
 * The rules under test: an expense debits its category lines and credits the
 * account it was paid from; a bill credits A/P instead; input VAT is debited
 * only for a VAT-registered trader. That last one is why these exist — the draft
 * omits the VAT debit when unregistered, so any tax amount left on the expense
 * credited more than it debited and postOnce rejected the entry. A small
 * Ghanaian operator is typically not registered, so recording a taxed expense
 * failed outright in the default configuration.
 */
const MIGRATIONS = join(__dirname, '..', '..', '..', '..', '..', '..', 'packages', 'db', 'sqlite', 'migrations');
const TENANT = '00000000-0000-4000-8000-000000000001';

let db: Database.Database;

function makeDb(): Database.Database {
  const d = new Database(':memory:');
  d.pragma('foreign_keys = ON');
  for (const f of ['0001_baseline.sql', '0002_accounting.sql']) {
    d.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  }
  const now = new Date().toISOString();
  d.prepare(
    `INSERT INTO tenants (id, name, currency, locale, created_at, updated_at)
     VALUES (?, 'Donkor', 'GHS', 'en-GB', ?, ?)`,
  ).run(TENANT, now, now);
  ensureChartOfAccounts(d, TENANT);
  return d;
}

function setVatRegistered(registered: boolean): void {
  db.prepare('UPDATE accounting_settings SET vat_registered = ? WHERE tenant_id = ?')
    .run(registered ? 1 : 0, TENANT);
}

function makeExpense(over: Partial<Expense> = {}): Expense {
  return {
    id: 'exp-1',
    tenant_id: TENANT,
    vendor_id: null,
    kind: 'expense',
    number: 'EXP-000001',
    status: 'recorded',
    txn_date: '2026-03-01',
    due_date: null,
    payment_account_id: resolveAccount(db, TENANT, 'cash.cash'),
    payment_method: 'cash',
    reference: null,
    memo: null,
    subtotal_pesewas: 10_000,
    tax_pesewas: 0,
    total_pesewas: 10_000,
    item_unit_id: null,
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
    deleted_at: null,
    ...over,
  } as Expense;
}

function fuelLine(amount = 10_000): ExpenseLine {
  return {
    id: 'line-1',
    tenant_id: TENANT,
    expense_id: 'exp-1',
    account_id: resolveAccount(db, TENANT, 'expense.default'),
    description: 'Fuel',
    quantity: 1,
    unit_amount_pesewas: amount,
    amount_pesewas: amount,
    item_unit_id: null,
    sort_order: 0,
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
    deleted_at: null,
  } as ExpenseLine;
}

function totals(lines: Array<{ debit_pesewas: number; credit_pesewas: number }>) {
  return lines.reduce(
    (acc, l) => ({ debits: acc.debits + l.debit_pesewas, credits: acc.credits + l.credit_pesewas }),
    { debits: 0, credits: 0 },
  );
}

beforeEach(() => {
  db = makeDb();
});

describe('expense posting', () => {
  it('debits the category and credits the account it was paid from', () => {
    const draft = expenseDraft(db, TENANT, makeExpense(), [fuelLine()]);
    const cash = resolveAccount(db, TENANT, 'cash.cash');
    const category = resolveAccount(db, TENANT, 'expense.default');

    expect(draft.lines).toHaveLength(2);
    expect(draft.lines.find((l) => l.account_id === category)?.debit_pesewas).toBe(10_000);
    expect(draft.lines.find((l) => l.account_id === cash)?.credit_pesewas).toBe(10_000);
    expect(totals(draft.lines).debits).toBe(totals(draft.lines).credits);
  });

  it('credits Accounts Payable for a bill rather than a cash account', () => {
    const draft = expenseDraft(
      db,
      TENANT,
      makeExpense({ kind: 'bill', payment_account_id: null, due_date: '2026-03-31' }),
      [fuelLine()],
    );
    const ap = resolveAccount(db, TENANT, 'ap');

    expect(draft.lines.find((l) => l.account_id === ap)?.credit_pesewas).toBe(10_000);
    expect(totals(draft.lines).debits).toBe(totals(draft.lines).credits);
  });

  it('refuses a non-bill with no payment account instead of posting a half entry', () => {
    expect(() =>
      expenseDraft(db, TENANT, makeExpense({ payment_account_id: null }), [fuelLine()]),
    ).toThrow(/payment account/i);
  });

  it('debits input VAT only when the trader is VAT-registered', () => {
    setVatRegistered(true);
    const withVat = expenseDraft(
      db,
      TENANT,
      makeExpense({ tax_pesewas: 1_500, total_pesewas: 11_500 }),
      [fuelLine()],
    );
    const inputVat = resolveAccount(db, TENANT, 'tax.input_vat');
    expect(withVat.lines.find((l) => l.account_id === inputVat)?.debit_pesewas).toBe(1_500);
    expect(totals(withVat.lines).debits).toBe(totals(withVat.lines).credits);

    setVatRegistered(false);
    const withoutVat = expenseDraft(db, TENANT, makeExpense(), [fuelLine()]);
    expect(withoutVat.lines.some((l) => l.account_id === inputVat)).toBe(false);
    expect(totals(withoutVat.lines).debits).toBe(totals(withoutVat.lines).credits);
  });

  it('regression: an unregistered trader carrying tax would post an unbalanced entry', () => {
    // This is the shape createExpense used to persist — tax kept on the expense
    // while the trader is not registered. The draft omits the VAT debit, so the
    // credit exceeds the debits and postOnce must reject it. createExpense now
    // zeroes the tax instead, but the engine still has to refuse the bad shape.
    setVatRegistered(false);
    const bad = expenseDraft(
      db,
      TENANT,
      makeExpense({ tax_pesewas: 1_500, total_pesewas: 11_500 }),
      [fuelLine()],
    );
    const sums = totals(bad.lines);
    expect(sums.debits).not.toBe(sums.credits);
    expect(() => postOnce(db, TENANT, bad)).toThrow();
  });
});

describe('bill payment posting', () => {
  it('debits A/P and credits the paying account', () => {
    const ap = resolveAccount(db, TENANT, 'ap');
    const bank = resolveAccount(db, TENANT, 'cash.bank');

    const id = postOnce(db, TENANT, {
      entry_date: '2026-03-15',
      memo: 'Bill payment',
      origin: 'auto',
      source_type: 'bill_payment',
      source_id: 'bp-1',
      source_event: 'paid',
      lines: [
        { account_id: ap, debit_pesewas: 10_000, credit_pesewas: 0 },
        { account_id: bank, debit_pesewas: 0, credit_pesewas: 10_000 },
      ],
    } as Parameters<typeof postOnce>[2]);

    expect(id).toBeTruthy();
    const posted = db
      .prepare(
        `SELECT COALESCE(SUM(debit_pesewas),0) AS d, COALESCE(SUM(credit_pesewas),0) AS c
         FROM journal_lines WHERE tenant_id = ?`,
      )
      .get(TENANT) as { d: number; c: number };
    expect(posted.d).toBe(posted.c);
  });
});
