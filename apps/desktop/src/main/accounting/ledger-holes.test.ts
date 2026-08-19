import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ensureChartOfAccounts, resolveAccount } from './chart';
import { arTiesToSubLedger, depositsNeverNegative, everyEntryBalances, unpostedEvents } from './health';
import { createBooking } from '../repositories/bookings';
import { createInvoiceFromBooking, recordPayment, updateInvoice, voidPayment } from '../repositories/invoices';

/**
 * Ways a business record could be written without the matching ledger entry, or
 * with the wrong one. Each of these leaves the books quietly wrong — the screen
 * says one thing and the Balance Sheet says another, with nothing to flag it.
 *
 * The house health checks are the oracle: if these hold, the books tie.
 */
const MIGRATIONS = join(__dirname, '..', '..', '..', '..', '..', 'packages', 'db', 'sqlite', 'migrations');
const TENANT = '00000000-0000-4000-8000-000000000001';
const ITEM = 'item-chairs';

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
  d.prepare(
    `INSERT INTO items (id, tenant_id, kind, sku, name, daily_rate_pesewas,
      replacement_value_pesewas, total_quantity, status, created_at, updated_at)
     VALUES (?, ?, 'party_supply', 'CHAIR', 'Chairs', 1000, 5000, 100, 'active', ?, ?)`,
  ).run(ITEM, TENANT, now, now);
  ensureChartOfAccounts(d, TENANT);
  return d;
}

function draftInvoice() {
  const booking = createBooking(db, TENANT, {
    customer_id: null,
    renter_name: 'Walk-in',
    renter_phone: null,
    starts_at: '2026-03-01T00:00:00.000Z',
    ends_at: '2026-03-03T00:00:00.000Z',
    pickup_location: null,
    dropoff_location: null,
    driver_name: null,
    notes: null,
    lines: [{ item_id: ITEM, item_unit_id: null, quantity: 10, daily_rate_pesewas: 1_000, notes: null }],
  } as Parameters<typeof createBooking>[2]);
  return createInvoiceFromBooking(db, TENANT, {
    booking_id: booking.id,
    due_at: '2026-03-10T00:00:00.000Z',
    include_statutory_taxes: false,
  } as Parameters<typeof createInvoiceFromBooking>[2]);
}

function pay(invoiceId: string, amount: number, kind: 'payment' | 'deposit' | 'refund' = 'payment') {
  return recordPayment(db, TENANT, {
    invoice_id: invoiceId,
    kind,
    amount_pesewas: amount,
    method: 'cash',
    paid_at: '2026-03-05T00:00:00.000Z',
    reference: null,
    notes: null,
  } as Parameters<typeof recordPayment>[2]);
}

function accountBalance(key: string): number {
  const id = resolveAccount(db, TENANT, key);
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(debit_pesewas), 0) - COALESCE(SUM(credit_pesewas), 0) AS bal
       FROM journal_lines WHERE tenant_id = ? AND account_id = ?`,
    )
    .get(TENANT, id) as { bal: number };
  return row.bal;
}

/** Total credited to income, whichever income account the mapping chose. */
function totalIncome(): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(jl.credit_pesewas), 0) - COALESCE(SUM(jl.debit_pesewas), 0) AS bal
       FROM journal_lines jl
       JOIN accounts a ON a.id = jl.account_id AND a.tenant_id = jl.tenant_id
       WHERE jl.tenant_id = ? AND a.account_type = 'income'`,
    )
    .get(TENANT) as { bal: number };
  return row.bal;
}

/** Everything the house checks insist on, asserted together. */
function expectBooksTie(): void {
  expect(everyEntryBalances(db, TENANT)).toEqual([]);
  expect(unpostedEvents(db, TENANT)).toEqual([]);
  expect(depositsNeverNegative(db, TENANT).ok).toBe(true);
  expect(arTiesToSubLedger(db, TENANT, '2026-12-31').delta_pesewas).toBe(0);
}

beforeEach(() => {
  db = makeDb();
});

describe('an invoice settled straight from draft', () => {
  it('still records the revenue', () => {
    // A draft covered in full by a deposit has a zero balance, so the "cannot
    // mark paid with a balance outstanding" guard does not fire — and the issue
    // entry was only posted on the draft -> issued move. The invoice went to
    // paid having never recorded a cedi of income or a pesewa of tax.
    const invoice = draftInvoice();
    pay(invoice.id, invoice.total_pesewas, 'deposit');
    updateInvoice(db, TENANT, invoice.id, { status: 'paid' } as Parameters<typeof updateInvoice>[3]);

    // Whichever income account the item maps to, the revenue must be there.
    expect(totalIncome()).toBe(invoice.total_pesewas);
    expectBooksTie();
  });

  it('stamps an issue date so the invoice is not undated', () => {
    const invoice = draftInvoice();
    pay(invoice.id, invoice.total_pesewas, 'deposit');
    const paid = updateInvoice(db, TENANT, invoice.id, { status: 'paid' } as Parameters<typeof updateInvoice>[3]);
    expect(paid.issued_at).toBeTruthy();
  });

  it('leaves the normal draft -> issued -> paid route untouched', () => {
    const invoice = draftInvoice();
    const issued = updateInvoice(db, TENANT, invoice.id, { status: 'issued' } as Parameters<typeof updateInvoice>[3]);
    pay(issued.id, issued.total_pesewas);
    updateInvoice(db, TENANT, invoice.id, { status: 'paid' } as Parameters<typeof updateInvoice>[3]);

    // Exactly one issue entry — the fix must not double-post.
    const issues = db
      .prepare("SELECT COUNT(*) AS n FROM journal_entries WHERE tenant_id = ? AND source_event = 'issued'")
      .get(TENANT) as { n: number };
    expect(issues.n).toBe(1);
    expectBooksTie();
  });
});

describe('refunding a deposit taken against a draft', () => {
  it('gives the money back out of the deposit liability, not out of receivables', () => {
    // Taking a deposit on a draft correctly credits Customer Deposits Held
    // rather than A/R, because there is no receivable yet. The refund did not
    // make the same distinction and always debited A/R — inventing a receivable
    // against an invoice the sub-ledger does not even count.
    const invoice = draftInvoice();
    pay(invoice.id, 5_000, 'deposit');
    expect(accountBalance('customer_deposits')).toBe(-5_000); // liability, credit balance

    pay(invoice.id, 5_000, 'refund');

    expect(accountBalance('customer_deposits')).toBe(0);
    expect(accountBalance('ar')).toBe(0);
    expectBooksTie();
  });

  it('still puts a refund on an issued invoice through receivables', () => {
    // On an issued invoice the receivable is real, so this direction must not
    // change.
    const invoice = draftInvoice();
    const issued = updateInvoice(db, TENANT, invoice.id, { status: 'issued' } as Parameters<typeof updateInvoice>[3]);
    pay(issued.id, 5_000);
    const arAfterPayment = accountBalance('ar');

    pay(issued.id, 5_000, 'refund');
    expect(accountBalance('ar')).toBe(arAfterPayment + 5_000);
    expectBooksTie();
  });
});

describe('voiding a deposit', () => {
  it('is refused once the deposit has been applied to an issued invoice', () => {
    // Issuing an invoice posts a second, linked entry that moves held deposits
    // out of Customer Deposits Held and into receivables. voidPayment only ever
    // reversed the entry filed against the payment itself, so that transfer was
    // left standing: the liability went negative and A/R was understated by the
    // deposit. The invoice side already insists on refund-then-void; the same
    // order applies here.
    const invoice = draftInvoice();
    pay(invoice.id, 5_000, 'deposit');
    const issued = updateInvoice(db, TENANT, invoice.id, { status: 'issued' } as Parameters<typeof updateInvoice>[3]);

    const before = arTiesToSubLedger(db, TENANT, '2026-12-31').delta_pesewas;
    expect(before).toBe(0);

    const deposit = db
      .prepare("SELECT id FROM payments WHERE invoice_id = ? AND kind = 'deposit'")
      .get(issued.id) as { id: string };

    expect(() => voidPayment(db, TENANT, deposit.id)).toThrow(/applied|refund/i);
    expectBooksTie();
  });

  it('still voids a deposit on an invoice that is still a draft', () => {
    // Nothing has been applied yet, so this is just undoing a mistake.
    const invoice = draftInvoice();
    const { payment } = pay(invoice.id, 5_000, 'deposit');
    expect(accountBalance('customer_deposits')).toBe(-5_000);

    voidPayment(db, TENANT, payment.id);

    expect(accountBalance('customer_deposits')).toBe(0);
    expectBooksTie();
  });

  it('still voids an ordinary payment on an issued invoice', () => {
    const invoice = draftInvoice();
    const issued = updateInvoice(db, TENANT, invoice.id, { status: 'issued' } as Parameters<typeof updateInvoice>[3]);
    const { payment } = pay(issued.id, 5_000);

    voidPayment(db, TENANT, payment.id);
    expectBooksTie();
  });
});

describe('an over-large discount', () => {
  it('is refused instead of creating an invoice that can never be issued', () => {
    // The stored total was clamped at zero while the totals check insisted
    // total === subtotal + levies - discount. A fat-fingered discount therefore
    // saved happily and then refused to issue for ever, blaming the totals
    // rather than the discount, with no way to fix it but deleting the draft.
    const booking = createBooking(db, TENANT, {
      customer_id: null,
      renter_name: 'Walk-in',
      renter_phone: null,
      starts_at: '2026-03-01T00:00:00.000Z',
      ends_at: '2026-03-03T00:00:00.000Z',
      pickup_location: null,
      dropoff_location: null,
      driver_name: null,
      notes: null,
      lines: [{ item_id: ITEM, item_unit_id: null, quantity: 10, daily_rate_pesewas: 1_000, notes: null }],
    } as Parameters<typeof createBooking>[2]);

    expect(() => createInvoiceFromBooking(db, TENANT, {
      booking_id: booking.id,
      due_at: '2026-03-10T00:00:00.000Z',
      include_statutory_taxes: false,
      discount_pesewas: 999_999,
    } as Parameters<typeof createInvoiceFromBooking>[2])).toThrow(/discount/i);
  });

  it('still accepts a discount that fits, including one for the whole amount', () => {
    const invoice = draftInvoice();
    const full = updateInvoice(db, TENANT, invoice.id, {
      discount_pesewas: invoice.subtotal_pesewas,
    } as Parameters<typeof updateInvoice>[3]);
    expect(full.total_pesewas).toBe(0);

    // ...and it can actually be issued, which was the whole problem.
    expect(() => updateInvoice(db, TENANT, invoice.id, { status: 'issued' } as Parameters<typeof updateInvoice>[3]))
      .not.toThrow();
  });
});
