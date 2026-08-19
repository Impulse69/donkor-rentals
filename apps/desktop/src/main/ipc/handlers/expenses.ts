import { ipcMain } from 'electron';
import { z } from 'zod';
import { BillPaymentCreateInput, ExpenseCreateInput, ExpenseFilter, ExpenseUpdateInput, Uuid, type BillPayment, type Expense, type ExpenseLine } from '@shared/schemas';
import { format as formatMoney } from '@shared/money';
import { wrap } from '../envelope';
import { ensureBootstrapTenant, getDb } from '../../db';
import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { postOnce, reverseEntry, type JournalDraft } from '../../accounting/posting';
import { resolveAccount } from '../../accounting/chart';
import { toEntryDate } from '../../accounting/dates';

const expenseCols = 'id, tenant_id, vendor_id, kind, number, status, txn_date, due_date, payment_account_id, payment_method, reference, memo, subtotal_pesewas, tax_pesewas, total_pesewas, item_unit_id, created_at, updated_at, deleted_at';
const lineCols = 'id, tenant_id, expense_id, account_id, description, quantity, unit_amount_pesewas, amount_pesewas, item_unit_id, sort_order, created_at, updated_at, deleted_at';
const paymentCols = 'id, tenant_id, expense_id, paid_from_account_id, amount_pesewas, method, reference, paid_at, notes, created_at, updated_at, deleted_at';
const nowIso = (): string => new Date().toISOString();
function tenant(): string { return ensureBootstrapTenant(getDb()); }

interface ExpenseWithLines extends Expense { lines: ExpenseLine[]; bill_payments: BillPayment[]; paid_pesewas: number; balance_due_pesewas: number }

function nextNo(db: Database, tenantId: string): string {
  db.prepare('INSERT INTO expense_sequences (tenant_id,next_value) VALUES (@tenant_id,1) ON CONFLICT(tenant_id) DO NOTHING').run({ tenant_id: tenantId });
  const row = db.prepare('UPDATE expense_sequences SET next_value=next_value+1 WHERE tenant_id=@tenant_id RETURNING next_value-1 AS used').get({ tenant_id: tenantId }) as { used: number };
  return `EXP-${String(row.used).padStart(6, '0')}`;
}
function getExpense(db: Database, tenantId: string, id: string): ExpenseWithLines | null {
  const expense = db.prepare(`SELECT ${expenseCols} FROM expenses WHERE id=@id AND tenant_id=@tenant_id`).get({ id, tenant_id: tenantId }) as Expense | undefined;
  if (!expense) return null;
  const lines = db.prepare(`SELECT ${lineCols} FROM expense_lines WHERE expense_id=@id AND tenant_id=@tenant_id AND deleted_at IS NULL ORDER BY sort_order ASC`).all({ id, tenant_id: tenantId }) as ExpenseLine[];
  const bill_payments = db.prepare(`SELECT ${paymentCols} FROM bill_payments WHERE expense_id=@id AND tenant_id=@tenant_id AND deleted_at IS NULL ORDER BY paid_at ASC`).all({ id, tenant_id: tenantId }) as BillPayment[];
  const paid = bill_payments.reduce((s, p) => s + p.amount_pesewas, 0);
  return { ...expense, lines, bill_payments, paid_pesewas: paid, balance_due_pesewas: expense.total_pesewas - paid };
}
function listExpenses(db: Database, tenantId: string, filter: z.infer<typeof ExpenseFilter> = {}): Expense[] {
  const p: Record<string, unknown> = { tenant_id: tenantId }; let sql = `SELECT ${expenseCols} FROM expenses WHERE tenant_id=@tenant_id`;
  if (!filter.includeDeleted) sql += ' AND deleted_at IS NULL'; if (filter.kind) { sql += ' AND kind=@kind'; p.kind = filter.kind; } if (filter.status) { sql += ' AND status=@status'; p.status = filter.status; }
  if (filter.vendorId) { sql += ' AND vendor_id=@vendor_id'; p.vendor_id = filter.vendorId; } if (filter.dateFrom) { sql += ' AND txn_date>=@date_from'; p.date_from = filter.dateFrom; } if (filter.dateTo) { sql += ' AND txn_date<=@date_to'; p.date_to = filter.dateTo; }
  if (filter.search) { sql += ' AND (number LIKE @q OR memo LIKE @q OR reference LIKE @q)'; p.q = `%${filter.search}%`; }
  return db.prepare(`${sql} ORDER BY txn_date DESC, number DESC`).all(p) as Expense[];
}
export function expenseDraft(db: Database, tenantId: string, expense: Expense, lines: ExpenseLine[]): JournalDraft {
  const inputVat = db.prepare('SELECT vat_registered FROM accounting_settings WHERE tenant_id=@tenant_id').get({ tenant_id: tenantId }) as { vat_registered: number } | undefined;
  const creditAccount = expense.kind === 'bill' ? resolveAccount(db, tenantId, 'ap') : expense.payment_account_id;
  if (!creditAccount) throw new Error('Expense payment account is required');
  return {
    entry_date: expense.txn_date, memo: expense.memo ?? `${expense.kind} ${expense.number}`, source_type: 'expense', source_id: expense.id, source_event: expense.kind === 'bill' ? 'bill_recorded' : 'expense_recorded', origin: 'auto',
    lines: [
      ...lines.map((l) => ({ account_id: l.account_id, debit_pesewas: l.amount_pesewas, credit_pesewas: 0, memo: l.description, vendor_id: expense.vendor_id })),
      ...(inputVat?.vat_registered && expense.tax_pesewas > 0 ? [{ account_id: resolveAccount(db, tenantId, 'tax.input_vat'), debit_pesewas: expense.tax_pesewas, credit_pesewas: 0, vendor_id: expense.vendor_id }] : []),
      { account_id: creditAccount, debit_pesewas: 0, credit_pesewas: expense.total_pesewas, vendor_id: expense.vendor_id },
    ],
  };
}
/**
 * Input VAT is only reclaimable by a VAT-registered trader. When the company is
 * not registered, expenseDraft omits the input-VAT debit — so carrying a tax
 * amount here would credit `total` against debits of only `subtotal`, and
 * postOnce would reject the entry as unbalanced. The common case for a small
 * Ghanaian operator is not registered, which made recording any taxed expense
 * fail outright. Tax is folded into the line amounts instead: not registered
 * means line amounts are tax-inclusive.
 */
function reclaimableTax(db: Database, tenantId: string, taxPesewas: number): number {
  const row = db
    .prepare('SELECT vat_registered FROM accounting_settings WHERE tenant_id = @tenant_id')
    .get({ tenant_id: tenantId }) as { vat_registered: number } | undefined;
  return row?.vat_registered ? taxPesewas : 0;
}

/** What is still owed on a bill: its total, less every payment recorded. */
function billBalance(db: Database, tenantId: string, expenseId: string): number {
  const bill = db
    .prepare('SELECT total_pesewas FROM expenses WHERE id=@id AND tenant_id=@tenant_id AND deleted_at IS NULL')
    .get({ id: expenseId, tenant_id: tenantId }) as { total_pesewas: number } | undefined;
  if (!bill) throw new Error('Bill not found');
  const paid = db
    .prepare(
      `SELECT COALESCE(SUM(amount_pesewas), 0) AS n FROM bill_payments
       WHERE expense_id=@id AND tenant_id=@tenant_id AND deleted_at IS NULL`,
    )
    .get({ id: expenseId, tenant_id: tenantId }) as { n: number };
  return bill.total_pesewas - paid.n;
}

function paymentsAgainst(db: Database, tenantId: string, expenseId: string): number {
  return (db
    .prepare(
      `SELECT COUNT(*) AS n FROM bill_payments
       WHERE expense_id=@id AND tenant_id=@tenant_id AND deleted_at IS NULL`,
    )
    .get({ id: expenseId, tenant_id: tenantId }) as { n: number }).n;
}

export function createExpense(db: Database, tenantId: string, input: z.infer<typeof ExpenseCreateInput>): ExpenseWithLines {
  const id = uuidv4(); const now = nowIso(); const number = input.number || nextNo(db, tenantId);
  const tax = reclaimableTax(db, tenantId, input.tax_pesewas);
  const subtotal = input.lines.reduce((s, l) => s + l.amount_pesewas, 0); const total = subtotal + tax;
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO expenses (${expenseCols}) VALUES (@id,@tenant_id,@vendor_id,@kind,@number,@status,@txn_date,@due_date,@payment_account_id,@payment_method,@reference,@memo,@subtotal_pesewas,@tax_pesewas,@total_pesewas,@item_unit_id,@created_at,@updated_at,NULL)`)
      .run({ id, tenant_id: tenantId, vendor_id: input.vendor_id ?? null, kind: input.kind, number, status: input.status ?? 'draft', txn_date: input.txn_date, due_date: input.due_date ?? null, payment_account_id: input.payment_account_id ?? null, payment_method: input.payment_method ?? null, reference: input.reference ?? null, memo: input.memo ?? null, subtotal_pesewas: subtotal, tax_pesewas: tax, total_pesewas: total, item_unit_id: input.item_unit_id ?? null, created_at: now, updated_at: now });
    input.lines.forEach((l, i) => db.prepare(`INSERT INTO expense_lines (${lineCols}) VALUES (@id,@tenant_id,@expense_id,@account_id,@description,@quantity,@unit_amount_pesewas,@amount_pesewas,@item_unit_id,@sort_order,@created_at,@updated_at,NULL)`).run({ ...l, id: uuidv4(), tenant_id: tenantId, expense_id: id, item_unit_id: l.item_unit_id ?? null, sort_order: l.sort_order ?? i, created_at: now, updated_at: now }));
    const created = getExpense(db, tenantId, id); if (!created) throw new Error('createExpense: readback failed');
    if (created.status !== 'draft') postOnce(db, tenantId, expenseDraft(db, tenantId, created, created.lines));
  }); tx();
  const row = getExpense(db, tenantId, id); if (!row) throw new Error('createExpense: readback failed'); return row;
}
export function updateExpense(db: Database, tenantId: string, id: string, patch: z.infer<typeof ExpenseUpdateInput>): ExpenseWithLines {
  const existing = getExpense(db, tenantId, id); if (!existing) throw new Error(`updateExpense: expense ${id} not found`);
  const merged = { ...existing, ...patch, updated_at: nowIso() };
  // The write and its posting have to succeed or fail together. Without this
  // wrapper better-sqlite3 autocommits the UPDATE, so a posting refused by a
  // closed period left the expense approved with no journal entry behind it —
  // money spent, books silent, and nothing anywhere to flag the gap.
  const tx = db.transaction(() => {
    db.prepare('UPDATE expenses SET status=@status,due_date=@due_date,payment_account_id=@payment_account_id,payment_method=@payment_method,reference=@reference,memo=@memo,updated_at=@updated_at WHERE id=@id AND tenant_id=@tenant_id')
      .run({ id, tenant_id: tenantId, status: merged.status, due_date: merged.due_date ?? null, payment_account_id: merged.payment_account_id ?? null, payment_method: merged.payment_method ?? null, reference: merged.reference ?? null, memo: merged.memo ?? null, updated_at: merged.updated_at });
    if (existing.status === 'draft' && merged.status !== 'draft') postOnce(db, tenantId, expenseDraft(db, tenantId, merged, existing.lines));
  }); tx();
  const row = getExpense(db, tenantId, id); if (!row) throw new Error('updateExpense: readback failed'); return row;
}
export function voidExpense(db: Database, tenantId: string, id: string): ExpenseWithLines {
  const tx = db.transaction(() => {
    // Voiding reverses the bill's own entry only. Any bill payment already made
    // debited A/P separately, and that debit would stay — leaving the payable
    // negative while the cash remained gone. Reverse the payments first, the
    // same order the invoice side already insists on.
    const paid = paymentsAgainst(db, tenantId, id);
    if (paid > 0) {
      throw new Error(
        `Cannot void this bill — ${paid} payment${paid === 1 ? ' has' : 's have'} been recorded against it. ` +
          'Void the payments first, then void the bill.',
      );
    }
    const e = db.prepare("SELECT id FROM journal_entries WHERE tenant_id=@tenant_id AND source_type='expense' AND source_id=@id AND reversed_by_id IS NULL LIMIT 1").get({ tenant_id: tenantId, id }) as { id: string } | undefined;
    if (e) reverseEntry(db, tenantId, e.id, new Date().toISOString().slice(0, 10), 'Expense voided');
    db.prepare("UPDATE expenses SET status='void', updated_at=@t WHERE id=@id AND tenant_id=@tenant_id").run({ id, tenant_id: tenantId, t: nowIso() });
  }); tx();
  const row = getExpense(db, tenantId, id); if (!row) throw new Error('voidExpense: readback failed'); return row;
}
export function recordBillPayment(db: Database, tenantId: string, input: z.infer<typeof BillPaymentCreateInput>): BillPayment {
  const id = uuidv4(); const now = nowIso();
  const tx = db.transaction(() => {
    // A/P is a liability: it should never carry a debit balance. Every check
    // here exists to stop one. The invoice side has had these guards from the
    // start; the bill side went without.
    const bill = db
      .prepare('SELECT kind, status FROM expenses WHERE id=@id AND tenant_id=@tenant_id AND deleted_at IS NULL')
      .get({ id: input.expense_id, tenant_id: tenantId }) as { kind: string; status: string } | undefined;
    if (!bill) throw new Error('Bill not found');
    if (bill.kind !== 'bill') {
      // A cash expense credited the payment account directly and never touched
      // A/P, so debiting it here invents a payable that was never owed.
      throw new Error('Only a bill can take a bill payment — this was paid at the time it was recorded.');
    }
    if (bill.status === 'draft') throw new Error('Approve the bill before paying it.');
    if (bill.status === 'void') throw new Error('This bill has been voided.');

    const outstanding = billBalance(db, tenantId, input.expense_id);
    if (input.amount_pesewas > outstanding) {
      throw new Error(
        `Payment of ${formatMoney(input.amount_pesewas)} is more than the ${formatMoney(outstanding)} still owed on this bill.`,
      );
    }

    db.prepare(`INSERT INTO bill_payments (${paymentCols}) VALUES (@id,@tenant_id,@expense_id,@paid_from_account_id,@amount_pesewas,@method,@reference,@paid_at,@notes,@created_at,@updated_at,NULL)`).run({ id, tenant_id: tenantId, ...input, reference: input.reference ?? null, notes: input.notes ?? null, created_at: now, updated_at: now });
    postOnce(db, tenantId, { entry_date: toEntryDate(input.paid_at), memo: 'Bill payment', source_type: 'bill_payment', source_id: id, source_event: 'paid', origin: 'auto', lines: [{ account_id: resolveAccount(db, tenantId, 'ap'), debit_pesewas: input.amount_pesewas, credit_pesewas: 0 }, { account_id: input.paid_from_account_id, debit_pesewas: 0, credit_pesewas: input.amount_pesewas }] });
  }); tx();
  return db.prepare(`SELECT ${paymentCols} FROM bill_payments WHERE id=@id AND tenant_id=@tenant_id`).get({ id, tenant_id: tenantId }) as BillPayment;
}

export function registerExpensesIpc(): void {
  ipcMain.handle('expenses:list', wrap('expenses:list', ExpenseFilter.optional().default({}), (f) => listExpenses(getDb(), tenant(), f ?? {})));
  ipcMain.handle('expenses:get', wrap('expenses:get', z.object({ id: Uuid }), ({ id }) => getExpense(getDb(), tenant(), id)));
  ipcMain.handle('expenses:create', wrap('expenses:create', ExpenseCreateInput, (input) => createExpense(getDb(), tenant(), input)));
  ipcMain.handle('expenses:update', wrap('expenses:update', z.object({ id: Uuid, patch: ExpenseUpdateInput }), ({ id, patch }) => updateExpense(getDb(), tenant(), id, patch)));
  ipcMain.handle('expenses:void', wrap('expenses:void', z.object({ id: Uuid }), ({ id }) => voidExpense(getDb(), tenant(), id)));
  ipcMain.handle('expenses:recordBillPayment', wrap('expenses:recordBillPayment', BillPaymentCreateInput, (input) => recordBillPayment(getDb(), tenant(), input)));
  ipcMain.handle('expenses:voidBillPayment', wrap('expenses:voidBillPayment', z.object({ id: Uuid }), ({ id }) => {
    const t = tenant(); const db = getDb();
    // Same reasoning as updateExpense: the reversal and the soft delete are one
    // change, so they belong in one transaction.
    const tx = db.transaction(() => {
      const e = db.prepare("SELECT id FROM journal_entries WHERE tenant_id=@tenant_id AND source_type='bill_payment' AND source_id=@id AND reversed_by_id IS NULL LIMIT 1").get({ tenant_id: t, id }) as { id: string } | undefined;
      if (e) reverseEntry(db, t, e.id, new Date().toISOString().slice(0, 10), 'Bill payment voided');
      db.prepare('UPDATE bill_payments SET deleted_at=@now, updated_at=@now WHERE id=@id AND tenant_id=@tenant_id').run({ id, tenant_id: t, now: nowIso() });
    }); tx();
    return { id };
  }));
}
