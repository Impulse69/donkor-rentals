import type { Database } from 'better-sqlite3';
import { agingBucket, type AgingBucket } from '@shared/accounting';
import { fiscalYearStart } from '../accounting/dates';

export interface TrialBalanceRow {
  account_id: string;
  code: string;
  name: string;
  account_type: string;
  classification: string;
  debit_pesewas: number;
  credit_pesewas: number;
  balance_side: 'debit' | 'credit' | 'zero';
  balance_pesewas: number;
}

export interface ProfitAndLossRow {
  account_id: string;
  code: string;
  name: string;
  account_type: 'income' | 'expense';
  classification: string;
  amount_pesewas: number;
}

export interface BalanceSheetRow {
  account_id: string;
  code: string;
  name: string;
  account_type: 'asset' | 'liability' | 'equity';
  classification: string;
  amount_pesewas: number;
  computed?: boolean;
}

export interface BalanceSheetReport {
  rows: BalanceSheetRow[];
  retained_earnings_pesewas: number;
  current_net_income_pesewas: number;
  out_of_balance_pesewas: number;
}

export interface ArAgingRow {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  issued_at: string;
  due_at: string | null;
  total_pesewas: number;
  paid_as_of_pesewas: number;
  balance_pesewas: number;
  days_overdue: number;
  bucket: AgingBucket;
}

export interface LedgerRow {
  entry_id: string;
  line_id: string;
  entry_no: string;
  entry_date: string;
  memo: string | null;
  debit_pesewas: number;
  credit_pesewas: number;
  running_balance_pesewas: number;
}

function dateRange(start: string | undefined): string {
  return start ? 'e.entry_date >= @start AND e.entry_date <= @end' : 'e.entry_date <= @end';
}

export function trialBalance(db: Database, tenantId: string, asOf: string, start?: string): TrialBalanceRow[] {
  const rows = db.prepare(
    `SELECT a.id AS account_id, a.code, a.name, a.account_type, a.classification,
            COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN l.debit_pesewas ELSE 0 END), 0) AS debit_pesewas,
            COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN l.credit_pesewas ELSE 0 END), 0) AS credit_pesewas
     FROM accounts a
     LEFT JOIN journal_lines l ON l.account_id = a.id AND l.tenant_id = a.tenant_id
     LEFT JOIN journal_entries e ON e.id = l.entry_id AND e.tenant_id = a.tenant_id
       AND e.status = 'posted' AND ${dateRange(start)}
     WHERE a.tenant_id = @tenant_id AND a.deleted_at IS NULL
     GROUP BY a.id
     -- Aggregate explicitly: these aliases collide with the real journal_lines
     -- column names, and SQLite resolves HAVING against the source columns
     -- first, so the alias form compared one arbitrary row instead of the sums.
     HAVING SUM(CASE WHEN e.id IS NOT NULL THEN l.debit_pesewas ELSE 0 END) <> 0
         OR SUM(CASE WHEN e.id IS NOT NULL THEN l.credit_pesewas ELSE 0 END) <> 0
     ORDER BY a.sort_order ASC, a.code ASC`,
  ).all({ tenant_id: tenantId, start: start ?? null, end: asOf }) as Array<Omit<TrialBalanceRow, 'balance_side' | 'balance_pesewas'>>;
  return rows.map((row) => {
    const net = row.debit_pesewas - row.credit_pesewas;
    return { ...row, balance_side: net > 0 ? 'debit' : net < 0 ? 'credit' : 'zero', balance_pesewas: Math.abs(net) };
  });
}

export function profitAndLoss(db: Database, tenantId: string, start: string, end: string): ProfitAndLossRow[] {
  return db.prepare(
    `SELECT a.id AS account_id, a.code, a.name, a.account_type, a.classification,
            CASE WHEN a.account_type = 'income'
              THEN COALESCE(SUM(l.credit_pesewas - l.debit_pesewas), 0)
              ELSE COALESCE(SUM(l.debit_pesewas - l.credit_pesewas), 0)
            END AS amount_pesewas
     FROM accounts a
     JOIN journal_lines l ON l.account_id = a.id AND l.tenant_id = a.tenant_id
     JOIN journal_entries e ON e.id = l.entry_id AND e.tenant_id = a.tenant_id
     WHERE a.tenant_id = @tenant_id AND e.status = 'posted'
       AND e.entry_date >= @start AND e.entry_date <= @end
       AND a.account_type IN ('income', 'expense')
     GROUP BY a.id
     HAVING amount_pesewas <> 0
     ORDER BY a.sort_order ASC, a.code ASC`,
  ).all({ tenant_id: tenantId, start, end }) as ProfitAndLossRow[];
}

function netIncome(db: Database, tenantId: string, start: string | null, end: string): number {
  const income = db.prepare(
    `SELECT COALESCE(SUM(l.credit_pesewas - l.debit_pesewas), 0) AS n
     FROM journal_lines l
     JOIN journal_entries e ON e.id = l.entry_id AND e.tenant_id = l.tenant_id
     JOIN accounts a ON a.id = l.account_id AND a.tenant_id = l.tenant_id
     WHERE l.tenant_id = @tenant_id AND e.status = 'posted'
       AND a.account_type = 'income'
       AND (@start IS NULL OR e.entry_date >= @start) AND e.entry_date <= @end`,
  ).get({ tenant_id: tenantId, start, end }) as { n: number };
  const expenses = db.prepare(
    `SELECT COALESCE(SUM(l.debit_pesewas - l.credit_pesewas), 0) AS n
     FROM journal_lines l
     JOIN journal_entries e ON e.id = l.entry_id AND e.tenant_id = l.tenant_id
     JOIN accounts a ON a.id = l.account_id AND a.tenant_id = l.tenant_id
     WHERE l.tenant_id = @tenant_id AND e.status = 'posted'
       AND a.account_type = 'expense'
       AND (@start IS NULL OR e.entry_date >= @start) AND e.entry_date <= @end`,
  ).get({ tenant_id: tenantId, start, end }) as { n: number };
  return income.n - expenses.n;
}

export function balanceSheet(db: Database, tenantId: string, asOf: string): BalanceSheetReport {
  const settings = db.prepare('SELECT fiscal_year_start_month FROM accounting_settings WHERE tenant_id = @tenant_id')
    .get({ tenant_id: tenantId }) as { fiscal_year_start_month: number } | undefined;
  const fyStart = fiscalYearStart(asOf, settings?.fiscal_year_start_month ?? 1);
  const rows = db.prepare(
    `SELECT a.id AS account_id, a.code, a.name, a.account_type, a.classification,
            CASE WHEN a.account_type = 'asset'
              THEN COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN l.debit_pesewas - l.credit_pesewas ELSE 0 END), 0)
              ELSE COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN l.credit_pesewas - l.debit_pesewas ELSE 0 END), 0)
            END AS amount_pesewas
     FROM accounts a
     LEFT JOIN journal_lines l ON l.account_id = a.id AND l.tenant_id = a.tenant_id
     LEFT JOIN journal_entries e ON e.id = l.entry_id AND e.tenant_id = a.tenant_id
       AND e.status = 'posted' AND e.entry_date <= @as_of
     WHERE a.tenant_id = @tenant_id AND a.deleted_at IS NULL
       AND a.account_type IN ('asset', 'liability', 'equity')
     GROUP BY a.id
     HAVING amount_pesewas <> 0
     ORDER BY a.sort_order ASC, a.code ASC`,
  ).all({ tenant_id: tenantId, as_of: asOf }) as BalanceSheetRow[];
  const retained = netIncome(db, tenantId, null, dateBefore(fyStart));
  const current = netIncome(db, tenantId, fyStart, asOf);
  const decorated = [
    ...rows,
    { account_id: 'retained-earnings-prior-years', code: 'RE', name: 'Retained Earnings (prior years)', account_type: 'equity' as const, classification: 'equity', amount_pesewas: retained, computed: true },
    { account_id: 'net-income-current-period', code: 'NI', name: 'Net Income (current period)', account_type: 'equity' as const, classification: 'equity', amount_pesewas: current, computed: true },
  ];
  const assets = rows.filter((r) => r.account_type === 'asset').reduce((s, r) => s + r.amount_pesewas, 0);
  const liabilitiesEquity = rows.filter((r) => r.account_type !== 'asset').reduce((s, r) => s + r.amount_pesewas, 0);
  return { rows: decorated, retained_earnings_pesewas: retained, current_net_income_pesewas: current, out_of_balance_pesewas: assets - liabilitiesEquity - retained - current };
}

function dateBefore(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function arAging(db: Database, tenantId: string, asOf: string): ArAgingRow[] {
  const rows = db.prepare(
    `SELECT i.id AS invoice_id, i.number AS invoice_number,
            COALESCE(c.name, b.renter_name, 'Walk-in rental') AS customer_name,
            i.issued_at, i.due_at, i.total_pesewas,
            COALESCE((SELECT SUM(CASE WHEN p.kind = 'refund' THEN -p.amount_pesewas ELSE p.amount_pesewas END)
              FROM payments p
              WHERE p.invoice_id = i.id AND p.tenant_id = i.tenant_id AND p.deleted_at IS NULL
                AND date(p.paid_at) <= @as_of), 0) AS paid_as_of_pesewas
     FROM invoices i
     JOIN bookings b ON b.id = i.booking_id AND b.tenant_id = i.tenant_id
     LEFT JOIN customers c ON c.id = b.customer_id AND c.tenant_id = i.tenant_id
     WHERE i.tenant_id = @tenant_id AND i.deleted_at IS NULL
       AND i.status IN ('issued', 'paid') AND date(COALESCE(i.issued_at, i.created_at)) <= @as_of
     ORDER BY COALESCE(i.due_at, i.issued_at) ASC`,
  ).all({ tenant_id: tenantId, as_of: asOf }) as Array<Omit<ArAgingRow, 'balance_pesewas' | 'days_overdue' | 'bucket'>>;
  return rows.map((row) => {
    const balance = row.total_pesewas - row.paid_as_of_pesewas;
    const due = row.due_at ?? row.issued_at.slice(0, 10);
    const days = Math.floor((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86400000);
    return { ...row, balance_pesewas: balance, days_overdue: days, bucket: agingBucket(days) };
  }).filter((row) => row.balance_pesewas !== 0);
}

export function generalLedger(db: Database, tenantId: string, start: string, end: string): LedgerRow[] {
  return ledgerRows(db, tenantId, null, start, end);
}

export function accountRegister(db: Database, tenantId: string, accountId: string, start: string, end: string): LedgerRow[] {
  return ledgerRows(db, tenantId, accountId, start, end);
}

function ledgerRows(db: Database, tenantId: string, accountId: string | null, start: string, end: string): LedgerRow[] {
  const rows = db.prepare(
    `SELECT e.id AS entry_id, l.id AS line_id, e.entry_no, e.entry_date,
            COALESCE(l.memo, e.memo) AS memo, l.debit_pesewas, l.credit_pesewas
     FROM journal_lines l
     JOIN journal_entries e ON e.id = l.entry_id AND e.tenant_id = l.tenant_id
     WHERE l.tenant_id = @tenant_id AND e.status = 'posted'
       AND (@account_id IS NULL OR l.account_id = @account_id)
       AND e.entry_date >= @start AND e.entry_date <= @end
     ORDER BY e.entry_date ASC, e.entry_no ASC, l.line_no ASC`,
  ).all({ tenant_id: tenantId, account_id: accountId, start, end }) as Array<Omit<LedgerRow, 'running_balance_pesewas'>>;
  let running = 0;
  return rows.map((row) => {
    running += row.debit_pesewas - row.credit_pesewas;
    return { ...row, running_balance_pesewas: running };
  });
}
