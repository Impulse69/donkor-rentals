import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export interface JournalDraftLine {
  account_id: string;
  debit_pesewas: number;
  credit_pesewas: number;
  memo?: string;
  customer_id?: string | null;
  vendor_id?: string | null;
  item_id?: string | null;
  item_unit_id?: string | null;
}

export interface JournalDraft {
  entry_date: string;
  memo?: string;
  source_type: 'invoice' | 'payment' | 'return' | 'expense' | 'bill_payment' | 'manual';
  source_id: string;
  source_event: string;
  origin: 'auto' | 'manual';
  bypassPeriodLock?: boolean;
  lines: JournalDraftLine[];
}

type IncomeSplitLine = {
  account_id: string;
  amount_pesewas: number;
  memo?: string;
  item_id?: string | null;
  item_unit_id?: string | null;
};

function line(input: JournalDraftLine): JournalDraftLine | null {
  if (input.debit_pesewas === 0 && input.credit_pesewas === 0) return null;
  return input;
}

function compact(lines: Array<JournalDraftLine | null>): JournalDraftLine[] {
  return lines.filter((l): l is JournalDraftLine => l !== null);
}

export function buildInvoiceIssuedEntry(input: {
  entry_date: string;
  invoice_id: string;
  invoice_number: string;
  customer_id?: string | null;
  ar_account_id: string;
  discounts_given_account_id: string;
  nhil_payable_account_id: string;
  getfund_payable_account_id: string;
  vat_payable_account_id: string;
  total_pesewas: number;
  subtotal_pesewas: number;
  discount_pesewas: number;
  nhil_pesewas: number;
  getfund_pesewas: number;
  vat_pesewas: number;
  income_default_account_id: string;
  income_lines: IncomeSplitLine[];
}): JournalDraft {
  const incomeTotal = input.income_lines.reduce((sum, l) => sum + l.amount_pesewas, 0);
  const defaultAdjustment = input.subtotal_pesewas - incomeTotal;
  const incomeLines = [...input.income_lines];
  if (defaultAdjustment !== 0) {
    incomeLines.push({
      account_id: input.income_default_account_id,
      amount_pesewas: defaultAdjustment,
      memo: 'Income split adjustment',
    });
  }
  return {
    entry_date: input.entry_date,
    memo: `Invoice ${input.invoice_number} issued`,
    source_type: 'invoice',
    source_id: input.invoice_id,
    source_event: 'issued',
    origin: 'auto',
    lines: compact([
      line({
        account_id: input.ar_account_id,
        debit_pesewas: input.total_pesewas,
        credit_pesewas: 0,
        customer_id: input.customer_id ?? null,
      }),
      line({
        account_id: input.discounts_given_account_id,
        debit_pesewas: input.discount_pesewas,
        credit_pesewas: 0,
        customer_id: input.customer_id ?? null,
      }),
      ...incomeLines.map((incomeLine) =>
        line({
          account_id: incomeLine.account_id,
          debit_pesewas: 0,
          credit_pesewas: incomeLine.amount_pesewas,
          memo: incomeLine.memo,
          customer_id: input.customer_id ?? null,
          item_id: incomeLine.item_id ?? null,
          item_unit_id: incomeLine.item_unit_id ?? null,
        }),
      ),
      line({ account_id: input.nhil_payable_account_id, debit_pesewas: 0, credit_pesewas: input.nhil_pesewas }),
      line({ account_id: input.getfund_payable_account_id, debit_pesewas: 0, credit_pesewas: input.getfund_pesewas }),
      line({ account_id: input.vat_payable_account_id, debit_pesewas: 0, credit_pesewas: input.vat_pesewas }),
    ]),
  };
}

export function buildDepositReceivedEntry(input: {
  entry_date: string;
  payment_id: string;
  invoice_is_draft: boolean;
  cash_account_id: string;
  customer_deposits_account_id: string;
  ar_account_id: string;
  amount_pesewas: number;
  customer_id?: string | null;
}): JournalDraft {
  return {
    entry_date: input.entry_date,
    memo: 'Deposit received',
    source_type: 'payment',
    source_id: input.payment_id,
    source_event: 'deposit_received',
    origin: 'auto',
    lines: compact([
      line({ account_id: input.cash_account_id, debit_pesewas: input.amount_pesewas, credit_pesewas: 0 }),
      line({
        account_id: input.invoice_is_draft ? input.customer_deposits_account_id : input.ar_account_id,
        debit_pesewas: 0,
        credit_pesewas: input.amount_pesewas,
        customer_id: input.customer_id ?? null,
      }),
    ]),
  };
}

export function buildDepositAppliedEntry(input: {
  entry_date: string;
  invoice_id: string;
  customer_deposits_account_id: string;
  ar_account_id: string;
  advances_pesewas: number;
  invoice_total_pesewas: number;
  customer_id?: string | null;
}): JournalDraft {
  const amount = Math.min(input.advances_pesewas, input.invoice_total_pesewas);
  return {
    entry_date: input.entry_date,
    memo: 'Deposit applied to issued invoice',
    source_type: 'invoice',
    source_id: input.invoice_id,
    source_event: 'deposit_applied',
    origin: 'auto',
    lines: compact([
      line({ account_id: input.customer_deposits_account_id, debit_pesewas: amount, credit_pesewas: 0, customer_id: input.customer_id ?? null }),
      line({ account_id: input.ar_account_id, debit_pesewas: 0, credit_pesewas: amount, customer_id: input.customer_id ?? null }),
    ]),
  };
}

export function buildPaymentReceivedEntry(input: {
  entry_date: string;
  payment_id: string;
  cash_account_id: string;
  ar_account_id: string;
  amount_pesewas: number;
  customer_id?: string | null;
}): JournalDraft {
  return {
    entry_date: input.entry_date,
    memo: 'Payment received',
    source_type: 'payment',
    source_id: input.payment_id,
    source_event: 'received',
    origin: 'auto',
    lines: compact([
      line({ account_id: input.cash_account_id, debit_pesewas: input.amount_pesewas, credit_pesewas: 0 }),
      line({ account_id: input.ar_account_id, debit_pesewas: 0, credit_pesewas: input.amount_pesewas, customer_id: input.customer_id ?? null }),
    ]),
  };
}

/**
 * All refunds debit A/R, including one that matches a return's refundable
 * deposit.
 *
 * The tempting rule is to release Customer Deposits Held when the refund equals
 * `returns.refund_pesewas`. It is wrong here, because a refund is recorded as a
 * `payments` row against the invoice and `amount_paid_pesewas` subtracts every
 * refund regardless of kind — so the invoice balance rises. If A/R did not rise
 * with it, `SUM(GL A/R)` would stop equalling `SUM(invoice balances)`, and that
 * tie-out is the invariant every report rests on. Following the app's own
 * semantics beats modelling the economics more prettily and lying about the
 * totals.
 *
 * The deposit liability is handled at return reconciliation instead. Note that
 * security deposits are never recorded as *received* (there is no payments row —
 * `returns.deposit_pesewas` is typed by hand), so Customer Deposits Held can go
 * negative. That is a data-quality signal, and `health.ts#depositsNeverNegative`
 * reports it rather than the ledger hiding it.
 */
/**
 * Giving money back has to come out of wherever it was put. A deposit taken
 * against a draft is credited to Customer Deposits Held, not to receivables —
 * see buildDepositReceivedEntry — so refunding it has to debit that same
 * liability. Always debiting A/R invented a receivable against an invoice the
 * sub-ledger does not even count, and left the returned cash sitting in the
 * deposit liability for ever.
 */
export function buildRefundedEntry(input: {
  entry_date: string;
  payment_id: string;
  /** A draft has no receivable yet; the money is being held, not owed. */
  invoice_is_draft: boolean;
  ar_account_id: string;
  customer_deposits_account_id: string;
  cash_account_id: string;
  amount_pesewas: number;
  customer_id?: string | null;
}): JournalDraft {
  return {
    entry_date: input.entry_date,
    memo: 'Refund issued',
    origin: 'auto',
    source_type: 'payment',
    source_id: input.payment_id,
    source_event: 'refunded',
    lines: [
      line({
        account_id: input.invoice_is_draft
          ? input.customer_deposits_account_id
          : input.ar_account_id,
        debit_pesewas: input.amount_pesewas,
        credit_pesewas: 0,
        customer_id: input.customer_id ?? null,
      }),
      line({
        account_id: input.cash_account_id,
        debit_pesewas: 0,
        credit_pesewas: input.amount_pesewas,
        customer_id: input.customer_id ?? null,
      }),
    ],
  };
}

export function buildReturnReconciledEntry(input: {
  entry_date: string;
  return_id: string;
  customer_deposits_account_id: string;
  ar_account_id: string;
  damage_recovery_account_id: string;
  deposit_pesewas: number;
  total_charges_pesewas: number;
  customer_id?: string | null;
}): JournalDraft {
  const depositApplied = Math.min(input.deposit_pesewas, input.total_charges_pesewas);
  const arAmount = Math.max(0, input.total_charges_pesewas - input.deposit_pesewas);
  return {
    entry_date: input.entry_date,
    memo: 'Return reconciled',
    source_type: 'return',
    source_id: input.return_id,
    source_event: 'reconciled',
    origin: 'auto',
    lines: compact([
      line({ account_id: input.customer_deposits_account_id, debit_pesewas: depositApplied, credit_pesewas: 0, customer_id: input.customer_id ?? null }),
      line({ account_id: input.ar_account_id, debit_pesewas: arAmount, credit_pesewas: 0, customer_id: input.customer_id ?? null }),
      line({ account_id: input.damage_recovery_account_id, debit_pesewas: 0, credit_pesewas: input.total_charges_pesewas, customer_id: input.customer_id ?? null }),
    ]),
  };
}

function sourceKey(draft: Pick<JournalDraft, 'source_type' | 'source_id' | 'source_event'>): string {
  return `${draft.source_type}:${draft.source_id}:${draft.source_event}`;
}

function nextEntryNo(db: Database, tenantId: string): string {
  db.prepare(
    `INSERT INTO journal_sequences (tenant_id, next_value) VALUES (@tenant_id, 1)
     ON CONFLICT(tenant_id) DO NOTHING`,
  ).run({ tenant_id: tenantId });
  const row = db
    .prepare(
      `UPDATE journal_sequences SET next_value = next_value + 1
       WHERE tenant_id = @tenant_id RETURNING next_value - 1 AS used`,
    )
    .get({ tenant_id: tenantId }) as { used: number };
  return `JE-${String(row.used).padStart(6, '0')}`;
}

export function postOnce(db: Database, tenantId: string, draft: JournalDraft): string | null {
  const key = sourceKey(draft);
  const debitTotal = draft.lines.reduce((sum, l) => sum + l.debit_pesewas, 0);
  const creditTotal = draft.lines.reduce((sum, l) => sum + l.credit_pesewas, 0);
  if (debitTotal !== creditTotal) {
    throw new Error(`Unbalanced journal draft ${key}: debits ${debitTotal}, credits ${creditTotal}`);
  }
  if (draft.lines.length === 0) return null;
  const closed = db
    .prepare('SELECT books_closed_through FROM accounting_settings WHERE tenant_id = @tenant_id')
    .get({ tenant_id: tenantId }) as { books_closed_through: string | null } | undefined;
  if (!draft.bypassPeriodLock && closed?.books_closed_through && draft.entry_date <= closed.books_closed_through) {
    throw new Error(`Accounting period is closed through ${closed.books_closed_through}; cannot post ${key} on ${draft.entry_date}`);
  }
  const existing = db
    .prepare('SELECT id FROM journal_entries WHERE tenant_id = @tenant_id AND source_key = @source_key')
    .get({ tenant_id: tenantId, source_key: key }) as { id: string } | undefined;
  if (existing) return existing.id;

  const now = new Date().toISOString();
  const entryId = uuidv4();
  db.prepare(
    `INSERT INTO journal_entries (id, tenant_id, entry_no, entry_date, memo, status, origin,
       source_type, source_id, source_event, source_key, reversal_of_id, reversed_by_id,
       posting_version, created_at, updated_at)
     VALUES (@id, @tenant_id, @entry_no, @entry_date, @memo, 'posted', @origin,
       @source_type, @source_id, @source_event, @source_key, NULL, NULL, 1, @created_at, @updated_at)`,
  ).run({
    id: entryId,
    tenant_id: tenantId,
    entry_no: nextEntryNo(db, tenantId),
    entry_date: draft.entry_date,
    memo: draft.memo ?? null,
    origin: draft.origin,
    source_type: draft.source_type,
    source_id: draft.source_id,
    source_event: draft.source_event,
    source_key: key,
    created_at: now,
    updated_at: now,
  });
  const insertLine = db.prepare(
    `INSERT INTO journal_lines (id, tenant_id, entry_id, line_no, account_id,
       debit_pesewas, credit_pesewas, memo, customer_id, vendor_id, item_id, item_unit_id, created_at)
     VALUES (@id, @tenant_id, @entry_id, @line_no, @account_id,
       @debit_pesewas, @credit_pesewas, @memo, @customer_id, @vendor_id, @item_id, @item_unit_id, @created_at)`,
  );
  draft.lines.forEach((draftLine, index) => {
    insertLine.run({
      id: uuidv4(),
      tenant_id: tenantId,
      entry_id: entryId,
      line_no: index + 1,
      account_id: draftLine.account_id,
      debit_pesewas: draftLine.debit_pesewas,
      credit_pesewas: draftLine.credit_pesewas,
      memo: draftLine.memo ?? null,
      customer_id: draftLine.customer_id ?? null,
      vendor_id: draftLine.vendor_id ?? null,
      item_id: draftLine.item_id ?? null,
      item_unit_id: draftLine.item_unit_id ?? null,
      created_at: now,
    });
  });
  return entryId;
}

export function reverseEntry(db: Database, tenantId: string, entryId: string, entryDate: string, reason: string): string {
  const original = db
    .prepare(
      `SELECT id, source_type, source_id, source_event
       FROM journal_entries
       WHERE id = @id AND tenant_id = @tenant_id`,
    )
    .get({ id: entryId, tenant_id: tenantId }) as
    | { id: string; source_type: JournalDraft['source_type']; source_id: string; source_event: string }
    | undefined;
  if (!original) throw new Error(`reverseEntry: entry ${entryId} not found`);
  const existing = db
    .prepare('SELECT id FROM journal_entries WHERE tenant_id = @tenant_id AND reversal_of_id = @entry_id')
    .get({ tenant_id: tenantId, entry_id: entryId }) as { id: string } | undefined;
  if (existing) return existing.id;
  const lines = db
    .prepare(
      `SELECT account_id, debit_pesewas, credit_pesewas, memo, customer_id, vendor_id, item_id, item_unit_id
       FROM journal_lines WHERE entry_id = @entry_id AND tenant_id = @tenant_id ORDER BY line_no ASC`,
    )
    .all({ entry_id: entryId, tenant_id: tenantId }) as JournalDraftLine[];
  const reversalId = postOnce(db, tenantId, {
    entry_date: entryDate,
    memo: reason,
    source_type: original.source_type,
    source_id: entryId,
    source_event: 'voided',
    origin: 'auto',
    lines: lines.map((l) => ({
      ...l,
      debit_pesewas: l.credit_pesewas,
      credit_pesewas: l.debit_pesewas,
    })),
  });
  if (!reversalId) throw new Error(`reverseEntry: entry ${entryId} had no lines`);
  db.prepare('UPDATE journal_entries SET reversal_of_id = @original_id WHERE id = @reversal_id AND tenant_id = @tenant_id')
    .run({ original_id: entryId, reversal_id: reversalId, tenant_id: tenantId });
  db.prepare('UPDATE journal_entries SET reversed_by_id = @reversal_id, updated_at = @updated_at WHERE id = @original_id AND tenant_id = @tenant_id')
    .run({ reversal_id: reversalId, original_id: entryId, tenant_id: tenantId, updated_at: new Date().toISOString() });
  return reversalId;
}
