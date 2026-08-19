import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ensureChartOfAccounts, resolveAccount } from '../../accounting/chart';
import { everyEntryBalances } from '../../accounting/health';
import { createExpense, recordBillPayment, updateExpense, voidExpense } from './expenses';

/**
 * Money going out, and the ways it could leave the books in a state nobody
 * would notice.
 *
 * Accounts Payable is the account under test in most of these: it records what
 * the business owes suppliers. A liability that goes *negative* is nonsense — it
 * reads as though the mechanic owes Donkor money — and it is the shape every one
 * of these bugs produced.
 */
const MIGRATIONS = join(__dirname, '..', '..', '..', '..', '..', '..', 'packages', 'db', 'sqlite', 'migrations');
const TENANT = '00000000-0000-4000-8000-000000000001';

let db: Database.Database;

function makeDb(): Database.Database {
  const d = new Database(':memory:');
  d.pragma('foreign_keys = ON');
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
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

function cash(): string {
  return resolveAccount(db, TENANT, 'cash.cash');
}

function makeBill(total = 50_000, status: 'draft' | 'recorded' = 'recorded') {
  return createExpense(db, TENANT, {
    vendor_id: null,
    kind: 'bill',
    status,
    txn_date: '2026-03-01',
    due_date: '2026-03-31',
    payment_account_id: null,
    payment_method: null,
    reference: null,
    memo: null,
    tax_pesewas: 0,
    item_unit_id: null,
    lines: [{
      account_id: resolveAccount(db, TENANT, 'expense.default'),
      description: 'Gearbox',
      quantity: 1,
      unit_amount_pesewas: total,
      amount_pesewas: total,
      item_unit_id: null,
      sort_order: 0,
    }],
  } as Parameters<typeof createExpense>[2]);
}

function makeCashExpense(total = 50_000) {
  return createExpense(db, TENANT, {
    vendor_id: null,
    kind: 'expense',
    status: 'recorded',
    txn_date: '2026-03-01',
    due_date: null,
    payment_account_id: cash(),
    payment_method: 'cash',
    reference: null,
    memo: null,
    tax_pesewas: 0,
    item_unit_id: null,
    lines: [{
      account_id: resolveAccount(db, TENANT, 'expense.default'),
      description: 'Diesel',
      quantity: 1,
      unit_amount_pesewas: total,
      amount_pesewas: total,
      item_unit_id: null,
      sort_order: 0,
    }],
  } as Parameters<typeof createExpense>[2]);
}

function payBill(expenseId: string, amount: number) {
  return recordBillPayment(db, TENANT, {
    expense_id: expenseId,
    paid_from_account_id: cash(),
    amount_pesewas: amount,
    method: 'cash',
    reference: null,
    paid_at: '2026-03-10T00:00:00.000Z',
    notes: null,
  } as Parameters<typeof recordBillPayment>[2]);
}

/** Debit-positive balance. A/P is a liability, so it should never be > 0. */
function balance(key: string): number {
  const id = resolveAccount(db, TENANT, key);
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(debit_pesewas),0) - COALESCE(SUM(credit_pesewas),0) AS bal
       FROM journal_lines WHERE tenant_id = ? AND account_id = ?`,
    )
    .get(TENANT, id) as { bal: number };
  return row.bal;
}

function closeBooksThrough(date: string): void {
  db.prepare('UPDATE accounting_settings SET books_closed_through = ? WHERE tenant_id = ?').run(date, TENANT);
}

function expenseStatus(id: string): string {
  return (db.prepare('SELECT status FROM expenses WHERE id = ?').get(id) as { status: string }).status;
}

function entryCount(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM journal_entries WHERE tenant_id = ?').get(TENANT) as { n: number }).n;
}

beforeEach(() => {
  db = makeDb();
});

describe('paying a bill', () => {
  it('clears the payable when paid in full', () => {
    const bill = makeBill(50_000);
    expect(balance('ap')).toBe(-50_000); // owed
    payBill(bill.id, 50_000);
    expect(balance('ap')).toBe(0);
    expect(everyEntryBalances(db, TENANT)).toEqual([]);
  });

  it('allows a part payment', () => {
    const bill = makeBill(50_000);
    payBill(bill.id, 20_000);
    expect(balance('ap')).toBe(-30_000);
  });

  it('refuses to pay more than the bill is for', () => {
    // Overpaying drove A/P to a debit balance — a liability reading as though
    // the supplier owed Donkor money.
    const bill = makeBill(50_000);
    expect(() => payBill(bill.id, 80_000)).toThrow(/balance|more than|exceed/i);
    expect(balance('ap')).toBe(-50_000);
  });

  it('refuses to pay more than the balance still outstanding', () => {
    const bill = makeBill(50_000);
    payBill(bill.id, 30_000);
    expect(() => payBill(bill.id, 30_000)).toThrow(/balance|more than|exceed/i);
    expect(balance('ap')).toBe(-20_000);
  });

  it('refuses to record a bill payment against a cash expense', () => {
    // A cash expense never credited A/P, so debiting it here invents a payable
    // that was never owed.
    const spent = makeCashExpense(50_000);
    expect(() => payBill(spent.id, 50_000)).toThrow(/bill/i);
    expect(balance('ap')).toBe(0);
  });

  it('refuses to pay a bill that is still a draft', () => {
    const draft = makeBill(50_000, 'draft');
    expect(() => payBill(draft.id, 50_000)).toThrow();
    expect(balance('ap')).toBe(0);
  });
});

describe('voiding', () => {
  it('refuses to void a bill that has already been paid', () => {
    // Voiding reversed only the bill entry, leaving the payment's A/P debit
    // behind: A/P went negative while the cash stayed gone.
    const bill = makeBill(50_000);
    payBill(bill.id, 50_000);

    expect(() => voidExpense(db, TENANT, bill.id)).toThrow(/paid|payment/i);
    expect(expenseStatus(bill.id)).not.toBe('void');
    expect(balance('ap')).toBe(0);
  });

  it('still voids a bill nobody has paid', () => {
    const bill = makeBill(50_000);
    voidExpense(db, TENANT, bill.id);
    expect(expenseStatus(bill.id)).toBe('void');
    expect(balance('ap')).toBe(0);
    expect(everyEntryBalances(db, TENANT)).toEqual([]);
  });

  it('still voids a cash expense', () => {
    const spent = makeCashExpense(50_000);
    voidExpense(db, TENANT, spent.id);
    expect(expenseStatus(spent.id)).toBe('void');
    expect(balance('cash.cash')).toBe(0);
  });
});

describe('approving a draft expense', () => {
  it('does not leave it approved when the posting is refused', () => {
    // The status UPDATE ran outside any transaction, so a posting refused by a
    // closed period still left the expense approved with no ledger entry —
    // money spent, books silent, and nothing to flag it.
    const draft = makeBill(50_000, 'draft');
    expect(entryCount()).toBe(0);
    closeBooksThrough('2026-12-31');

    expect(() =>
      updateExpense(db, TENANT, draft.id, { status: 'recorded' } as Parameters<typeof updateExpense>[3]),
    ).toThrow();

    expect(expenseStatus(draft.id)).toBe('draft');
    expect(entryCount()).toBe(0);
  });

  it('approves and posts together when the books are open', () => {
    const draft = makeBill(50_000, 'draft');
    updateExpense(db, TENANT, draft.id, { status: 'recorded' } as Parameters<typeof updateExpense>[3]);
    expect(expenseStatus(draft.id)).toBe('recorded');
    expect(balance('ap')).toBe(-50_000);
  });
});
