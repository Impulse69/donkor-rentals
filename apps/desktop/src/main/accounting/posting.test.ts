import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureChartOfAccounts, resolveAccount, resolveCashAccount } from './chart';
import {
  type JournalDraft,
  buildDepositAppliedEntry,
  buildDepositReceivedEntry,
  buildInvoiceIssuedEntry,
  buildPaymentReceivedEntry,
  buildRefundedEntry,
  buildReturnReconciledEntry,
  postOnce,
  reverseEntry,
} from './posting';

const MIGRATIONS = join(__dirname, '..', '..', '..', '..', '..', 'packages', 'db', 'sqlite', 'migrations');
const TENANT = '00000000-0000-4000-8000-000000000001';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const file of ['0001_baseline.sql', '0002_accounting.sql']) {
    db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  }
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tenants (id, name, currency, locale, created_at, updated_at)
     VALUES (?, 'Donkor and Sons', 'GHS', 'en-GB', ?, ?)`,
  ).run(TENANT, now, now);
  ensureChartOfAccounts(db, TENANT);
  return db;
}

function totals(draft: JournalDraft): { debits: number; credits: number } {
  return draft.lines.reduce(
    (sum, line) => ({
      debits: sum.debits + line.debit_pesewas,
      credits: sum.credits + line.credit_pesewas,
    }),
    { debits: 0, credits: 0 },
  );
}

function accounts(): Record<string, string> {
  return {
    ar: '00000000-0000-4000-8000-000000000101',
    cash: '00000000-0000-4000-8000-000000000102',
    deposits: '00000000-0000-4000-8000-000000000103',
    party: '00000000-0000-4000-8000-000000000104',
    hearse: '00000000-0000-4000-8000-000000000105',
    defaultIncome: '00000000-0000-4000-8000-000000000106',
    damage: '00000000-0000-4000-8000-000000000107',
    discount: '00000000-0000-4000-8000-000000000108',
    nhil: '00000000-0000-4000-8000-000000000109',
    getfund: '00000000-0000-4000-8000-000000000110',
    vat: '00000000-0000-4000-8000-000000000111',
  };
}

describe('posting builders', () => {
  it.each([
    {
      name: 'invoice issued',
      draft: () => {
        const a = accounts();
        return buildInvoiceIssuedEntry({
          entry_date: '2026-08-18',
          invoice_id: 'inv-1',
          invoice_number: 'INV-000001',
          ar_account_id: a.ar,
          discounts_given_account_id: a.discount,
          nhil_payable_account_id: a.nhil,
          getfund_payable_account_id: a.getfund,
          vat_payable_account_id: a.vat,
          total_pesewas: 4_024,
          subtotal_pesewas: 3_333,
          discount_pesewas: 0,
          nhil_pesewas: 83,
          getfund_pesewas: 83,
          vat_pesewas: 525,
          income_default_account_id: a.defaultIncome,
          income_lines: [{ account_id: a.party, amount_pesewas: 2_000 }, { account_id: a.hearse, amount_pesewas: 1_333 }],
        });
      },
    },
    {
      name: 'advance deposit received while draft',
      draft: () => {
        const a = accounts();
        return buildDepositReceivedEntry({
          entry_date: '2026-08-18',
          payment_id: 'pay-1',
          invoice_is_draft: true,
          cash_account_id: a.cash,
          customer_deposits_account_id: a.deposits,
          ar_account_id: a.ar,
          amount_pesewas: 1_000,
        });
      },
    },
    {
      name: 'advance deposit received after issue',
      draft: () => {
        const a = accounts();
        return buildDepositReceivedEntry({
          entry_date: '2026-08-18',
          payment_id: 'pay-2',
          invoice_is_draft: false,
          cash_account_id: a.cash,
          customer_deposits_account_id: a.deposits,
          ar_account_id: a.ar,
          amount_pesewas: 1_000,
        });
      },
    },
    {
      name: 'deposit applied',
      draft: () => {
        const a = accounts();
        return buildDepositAppliedEntry({
          entry_date: '2026-08-18',
          invoice_id: 'inv-1',
          customer_deposits_account_id: a.deposits,
          ar_account_id: a.ar,
          advances_pesewas: 1_500,
          invoice_total_pesewas: 1_000,
        });
      },
    },
    {
      name: 'payment received',
      draft: () => {
        const a = accounts();
        return buildPaymentReceivedEntry({
          entry_date: '2026-08-18',
          payment_id: 'pay-3',
          cash_account_id: a.cash,
          ar_account_id: a.ar,
          amount_pesewas: 1_000,
        });
      },
    },
    {
      name: 'refund matching return refund',
      draft: () => {
        const a = accounts();
        return buildRefundedEntry({
          entry_date: '2026-08-18',
          payment_id: 'pay-4',
          cash_account_id: a.cash,
          customer_deposits_account_id: a.deposits,
          ar_account_id: a.ar,
          amount_pesewas: 1_000,
          matches_return_refund: true,
        });
      },
    },
    {
      name: 'other refund',
      draft: () => {
        const a = accounts();
        return buildRefundedEntry({
          entry_date: '2026-08-18',
          payment_id: 'pay-5',
          cash_account_id: a.cash,
          customer_deposits_account_id: a.deposits,
          ar_account_id: a.ar,
          amount_pesewas: 1_000,
          matches_return_refund: false,
        });
      },
    },
    {
      name: 'return reconciled',
      draft: () => {
        const a = accounts();
        return buildReturnReconciledEntry({
          entry_date: '2026-08-18',
          return_id: 'ret-1',
          customer_deposits_account_id: a.deposits,
          ar_account_id: a.ar,
          damage_recovery_account_id: a.damage,
          deposit_pesewas: 700,
          total_charges_pesewas: 1_000,
        });
      },
    },
  ])('$name balances', ({ draft }) => {
    const { debits, credits } = totals(draft());
    expect(debits).toBe(credits);
    // A builder that returned no lines would satisfy debits === credits
    // trivially, so require the entry to actually move money.
    expect(debits).toBeGreaterThan(0);
    // And every line must carry exactly one side, or the schema CHECK rejects it
    // at insert time rather than here.
    for (const l of draft().lines) {
      expect((l.debit_pesewas === 0) !== (l.credit_pesewas === 0)).toBe(true);
      expect(l.debit_pesewas).toBeGreaterThanOrEqual(0);
      expect(l.credit_pesewas).toBeGreaterThanOrEqual(0);
    }
  });

  it('uses stored invoice tax columns exactly for the 3333 pesewa rounding regression', () => {
    const a = accounts();
    const draft = buildInvoiceIssuedEntry({
      entry_date: '2026-08-18',
      invoice_id: 'inv-rounding',
      invoice_number: 'INV-ROUND',
      ar_account_id: a.ar,
      discounts_given_account_id: a.discount,
      nhil_payable_account_id: a.nhil,
      getfund_payable_account_id: a.getfund,
      vat_payable_account_id: a.vat,
      total_pesewas: 4_024,
      subtotal_pesewas: 3_333,
      discount_pesewas: 0,
      nhil_pesewas: 83,
      getfund_pesewas: 83,
      vat_pesewas: 525,
      income_default_account_id: a.defaultIncome,
      income_lines: [{ account_id: a.party, amount_pesewas: 3_333 }],
    });
    expect(draft.lines.find((line) => line.account_id === a.ar)?.debit_pesewas).toBe(4_024);
    expect(totals(draft)).toEqual({ debits: 4_024, credits: 4_024 });
  });
});

describe('postOnce and reversals', () => {
  it('posts the same source event exactly once', () => {
    const db = makeDb();
    const draft = buildPaymentReceivedEntry({
      entry_date: '2026-08-18',
      payment_id: '00000000-0000-4000-8000-000000000201',
      cash_account_id: resolveCashAccount(db, TENANT, 'cash'),
      ar_account_id: resolveAccount(db, TENANT, 'ar'),
      amount_pesewas: 10_000,
    });
    const first = postOnce(db, TENANT, draft);
    const second = postOnce(db, TENANT, draft);
    expect(second).toBe(first);
    expect((db.prepare('SELECT COUNT(*) AS n FROM journal_entries').get() as { n: number }).n).toBe(1);
    db.close();
  });

  it('voiding an invoice nets the ledger to zero instead of deleting the entry', () => {
    const db = makeDb();
    const draft = buildInvoiceIssuedEntry({
      entry_date: '2026-08-18',
      invoice_id: '00000000-0000-4000-8000-000000000301',
      invoice_number: 'INV-000001',
      ar_account_id: resolveAccount(db, TENANT, 'ar'),
      discounts_given_account_id: resolveAccount(db, TENANT, 'discounts_given'),
      nhil_payable_account_id: resolveAccount(db, TENANT, 'tax.nhil_payable'),
      getfund_payable_account_id: resolveAccount(db, TENANT, 'tax.getfund_payable'),
      vat_payable_account_id: resolveAccount(db, TENANT, 'tax.vat_payable'),
      total_pesewas: 4_024,
      subtotal_pesewas: 3_333,
      discount_pesewas: 0,
      nhil_pesewas: 83,
      getfund_pesewas: 83,
      vat_pesewas: 525,
      income_default_account_id: resolveAccount(db, TENANT, 'income.default'),
      income_lines: [{ account_id: resolveAccount(db, TENANT, 'income.party_supply'), amount_pesewas: 3_333 }],
    });
    const entryId = postOnce(db, TENANT, draft);
    expect(entryId).toBeTruthy();
    reverseEntry(db, TENANT, entryId ?? '', '2026-08-19', 'Invoice voided');
    const net = db
      .prepare('SELECT SUM(debit_pesewas - credit_pesewas) AS n FROM journal_lines WHERE tenant_id = ?')
      .get(TENANT) as { n: number };
    expect(net.n).toBe(0);
    expect((db.prepare('SELECT COUNT(*) AS n FROM journal_entries').get() as { n: number }).n).toBe(2);
    db.close();
  });
});
