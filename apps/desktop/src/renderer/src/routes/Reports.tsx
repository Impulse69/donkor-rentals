import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AGING_BUCKET_LABELS, summariseProfitAndLoss } from '@shared/accounting';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { formatDate, formatGhs } from '../lib/format';
import { paths } from '../router/paths';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { EmptyState } from '../components/EmptyState';
import { Alert } from '../components/Alert';
import { Skeleton } from '../components/Skeleton';
import { Input, Select } from '../components/Field';
import { useToast } from '../components/Toast';

type ReportKey =
  | 'profit-loss'
  | 'balance-sheet'
  | 'ar-aging'
  | 'open-invoices'
  | 'trial-balance'
  | 'journal'
  | 'account-list'
  | 'utilization'
  | 'top-customers'
  | 'trip-log'
  | 'revenue';

type Preset = 'month' | 'quarter' | 'year' | 'custom';

interface ReportDef {
  key: ReportKey;
  label: string;
  group: string;
  description: string;
  mode: 'range' | 'as-of';
}

interface TrialBalanceRow {
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

interface ProfitAndLossRow {
  account_id: string;
  code: string;
  name: string;
  classification: Parameters<typeof summariseProfitAndLoss>[0][number]['classification'];
  amount_pesewas: number;
}

interface BalanceSheetRow {
  account_id: string;
  code: string;
  name: string;
  account_type: 'asset' | 'liability' | 'equity';
  amount_pesewas: number;
  computed?: boolean;
}

interface ArAgingRow {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  issued_at: string;
  due_at: string | null;
  total_pesewas: number;
  paid_as_of_pesewas: number;
  balance_pesewas: number;
  days_overdue: number;
  bucket: keyof typeof AGING_BUCKET_LABELS;
}

interface LedgerRow {
  line_id: string;
  entry_no: string;
  entry_date: string;
  memo: string | null;
  debit_pesewas: number;
  credit_pesewas: number;
  running_balance_pesewas: number;
}

interface InvoiceListRow {
  id: string;
  number: string;
  issued_at: string | null;
  due_at: string | null;
  customer_name?: string | null;
  renter_name?: string | null;
  total_pesewas: number;
  amount_paid_pesewas: number;
  balance_due_pesewas: number;
}

const REPORTS: ReportDef[] = [
  { key: 'profit-loss', label: 'Profit and Loss', group: 'Business overview', description: 'Income, cost of revenue, expenses, and net profit.', mode: 'range' },
  { key: 'balance-sheet', label: 'Balance Sheet', group: 'Business overview', description: 'Assets, liabilities, and computed equity as of a date.', mode: 'as-of' },
  { key: 'ar-aging', label: 'A/R Ageing Summary', group: 'Who owes you', description: 'Open receivables grouped by ageing bucket.', mode: 'as-of' },
  { key: 'open-invoices', label: 'Open Invoices', group: 'Who owes you', description: 'Issued invoices with a remaining balance.', mode: 'range' },
  { key: 'trial-balance', label: 'Trial Balance', group: 'For my accountant', description: 'Debit and credit balances by account.', mode: 'range' },
  { key: 'journal', label: 'Journal', group: 'For my accountant', description: 'Posted general ledger activity.', mode: 'range' },
  { key: 'account-list', label: 'Account List', group: 'For my accountant', description: 'Active and inactive chart of account rows.', mode: 'as-of' },
  { key: 'utilization', label: 'Utilization', group: 'Rentals', description: 'Booked quantity-days and utilization percentage.', mode: 'range' },
  { key: 'top-customers', label: 'Top Customers', group: 'Rentals', description: 'Highest-revenue rental customers.', mode: 'range' },
  { key: 'trip-log', label: 'Trip Log', group: 'Rentals', description: 'Recent hearse trip activity.', mode: 'range' },
  { key: 'revenue', label: 'Revenue', group: 'Rentals', description: 'Revenue and operations snapshot.', mode: 'range' },
];

const GROUPS = ['Business overview', 'Who owes you', 'For my accountant', 'Rentals'];

function inputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function presetRange(preset: Preset): { start: string; end: string } {
  const now = new Date();
  const end = inputDate(now);
  if (preset === 'year') return { start: `${now.getFullYear()}-01-01`, end };
  if (preset === 'quarter') {
    const qMonth = Math.floor(now.getMonth() / 3) * 3;
    return { start: inputDate(new Date(now.getFullYear(), qMonth, 1)), end };
  }
  return { start: inputDate(new Date(now.getFullYear(), now.getMonth(), 1)), end };
}

function customerName(row: { customer_name?: string | null; renter_name?: string | null }): string {
  return row.customer_name?.trim() || row.renter_name?.trim() || 'Walk-in rental';
}

function signedMoney(pesewas: number): string {
  return pesewas < 0 ? `-${formatGhs(Math.abs(pesewas))}` : formatGhs(pesewas);
}

export default function Reports(): JSX.Element {
  const toast = useToast();
  const [selected, setSelected] = useState<ReportKey>('profit-loss');
  const [query, setQuery] = useState('');
  const [preset, setPreset] = useState<Preset>('month');
  const initial = useMemo(() => presetRange('month'), []);
  const [range, setRange] = useState(initial);
  const [asOf, setAsOf] = useState(inputDate(new Date()));
  const [exporting, setExporting] = useState(false);

  const report = REPORTS.find((r) => r.key === selected) ?? REPORTS[0];
  const overview = useAsync(() => api.reports.overview(), []);
  const utilization = useAsync(() => api.reports.utilization(range.start, range.end), [range.start, range.end]);
  const topCustomers = useAsync(() => api.reports.topCustomers(10), []);
  const trips = useAsync(() => api.reports.tripLog(50), []);
  const pnl = useAsync(() => api.reports.profitAndLoss(range.start, range.end), [range.start, range.end]);
  const balanceSheet = useAsync(() => api.reports.balanceSheet(asOf), [asOf]);
  const arAging = useAsync(() => api.reports.arAging(asOf), [asOf]);
  const trialBalance = useAsync(() => api.reports.trialBalance(report.mode === 'as-of' ? asOf : range.end, report.mode === 'range' ? range.start : undefined), [report.mode, asOf, range.start, range.end]);
  const journal = useAsync(() => api.reports.generalLedger(range.start, range.end), [range.start, range.end]);
  const invoices = useAsync(() => api.invoices.list({ status: 'issued' }), []);
  const accounts = useAsync(() => api.accounts.list({ includeInactive: true }), []);

  function setPresetRange(next: Preset): void {
    setPreset(next);
    if (next !== 'custom') setRange(presetRange(next));
  }

  async function exportCsv(): Promise<void> {
    setExporting(true);
    try {
      const csv = await api.reports.exportCsv();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `donkor-reports-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.ok('CSV export prepared');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not export CSV');
    } finally {
      setExporting(false);
    }
  }

  const filtered = REPORTS.filter((r) => `${r.group} ${r.label} ${r.description}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="page fade-up" style={{ maxWidth: 1240 }}>
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Workspace / Reports</div>
          <h1 className="page-title">Reports</h1>
        </div>
        <div className="page-actions">
          <Button onClick={() => window.print()}>Print</Button>
          <Button onClick={() => { void exportCsv(); }} loading={exporting}>Export CSV</Button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 'var(--s-5)', alignItems: 'start' }}>
        <aside className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 'var(--s-3)', borderBottom: '1px solid var(--rule)' }}>
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a report..."
              aria-label="Search reports"
            />
          </div>
          <div style={{ padding: 'var(--s-2) 0' }}>
            {GROUPS.map((group) => {
              const groupReports = filtered.filter((r) => r.group === group);
              if (groupReports.length === 0) return null;
              return (
                <div key={group}>
                  <div className="sidebar-section" style={{ color: 'var(--ink-faint)' }}>{group}</div>
                  {groupReports.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => setSelected(r.key)}
                      className={`sidebar-link${selected === r.key ? ' active' : ''}`}
                      style={{ width: '100%', borderRight: 0, borderTop: 0, borderBottom: 0, background: selected === r.key ? 'var(--paper-tint)' : 'transparent', color: 'var(--ink)', textAlign: 'left' }}
                    >
                      <span className="glyph" aria-hidden />
                      <span>{r.label}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </aside>

        <section className="stack">
          <div className="dtable-toolbar">
            {report.mode === 'range' ? (
              <>
                <Select
                  label="Preset"
                  value={preset}
                  onChange={(e) => setPresetRange(e.target.value as Preset)}
                  options={[
                    { value: 'month', label: 'This month' },
                    { value: 'quarter', label: 'This quarter' },
                    { value: 'year', label: 'This year' },
                    { value: 'custom', label: 'Custom' },
                  ]}
                />
                <Input label="Start" type="date" value={range.start} onChange={(e) => { setPreset('custom'); setRange((s) => ({ ...s, start: e.target.value })); }} />
                <Input label="End" type="date" value={range.end} onChange={(e) => { setPreset('custom'); setRange((s) => ({ ...s, end: e.target.value })); }} />
              </>
            ) : (
              <Input label="As of" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            )}
            <div className="grow" />
            <div className="muted" style={{ alignSelf: 'center' }}>{report.description}</div>
          </div>

          <div className="card card-flush">
            <div className="row-between" style={{ padding: '14px 16px', borderBottom: '1px solid var(--rule)' }}>
              <div>
                <h2 className="card-title" style={{ margin: 0 }}>{report.label}</h2>
                <div className="faint mono" style={{ fontSize: 12 }}>
                  {report.mode === 'as-of' ? `As of ${asOf}` : `${range.start} to ${range.end}`}
                </div>
              </div>
            </div>
            <ReportBody
              selected={selected}
              overview={overview}
              utilization={utilization}
              topCustomers={topCustomers}
              trips={trips}
              pnl={pnl}
              balanceSheet={balanceSheet}
              arAging={arAging}
              trialBalance={trialBalance}
              journal={journal}
              invoices={invoices}
              accounts={accounts}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function ReportBody(props: {
  selected: ReportKey;
  overview: ReturnType<typeof useAsync<Awaited<ReturnType<typeof api.reports.overview>>>>;
  utilization: ReturnType<typeof useAsync<Awaited<ReturnType<typeof api.reports.utilization>>>>;
  topCustomers: ReturnType<typeof useAsync<Awaited<ReturnType<typeof api.reports.topCustomers>>>>;
  trips: ReturnType<typeof useAsync<Awaited<ReturnType<typeof api.reports.tripLog>>>>;
  pnl: ReturnType<typeof useAsync<Awaited<ReturnType<typeof api.reports.profitAndLoss>>>>;
  balanceSheet: ReturnType<typeof useAsync<Awaited<ReturnType<typeof api.reports.balanceSheet>>>>;
  arAging: ReturnType<typeof useAsync<Awaited<ReturnType<typeof api.reports.arAging>>>>;
  trialBalance: ReturnType<typeof useAsync<Awaited<ReturnType<typeof api.reports.trialBalance>>>>;
  journal: ReturnType<typeof useAsync<Awaited<ReturnType<typeof api.reports.generalLedger>>>>;
  invoices: ReturnType<typeof useAsync<Awaited<ReturnType<typeof api.invoices.list>>>>;
  accounts: ReturnType<typeof useAsync<Awaited<ReturnType<typeof api.accounts.list>>>>;
}): JSX.Element {
  switch (props.selected) {
    case 'profit-loss': return <ProfitLoss state={props.pnl} />;
    case 'balance-sheet': return <BalanceSheet state={props.balanceSheet} />;
    case 'ar-aging': return <ArAging state={props.arAging} />;
    case 'open-invoices': return <OpenInvoices state={props.invoices} />;
    case 'trial-balance': return <TrialBalance state={props.trialBalance} />;
    case 'journal': return <Journal state={props.journal} />;
    case 'account-list': return <AccountList state={props.accounts} />;
    case 'utilization': return <Utilization state={props.utilization} />;
    case 'top-customers': return <TopCustomers state={props.topCustomers} />;
    case 'trip-log': return <TripLog state={props.trips} />;
    case 'revenue': return <Revenue state={props.overview} />;
  }
}

function AsyncPane<T>({ state, empty, children }: { state: ReturnType<typeof useAsync<T>>; empty: string; children: (data: T) => JSX.Element }): JSX.Element {
  if (state.status === 'idle' || state.status === 'loading') return <div className="row" style={{ justifyContent: 'center', padding: 48 }}><Spinner /></div>;
  if (state.status === 'error') return <Alert tone="bad" eyebrow="Report error">{state.error.message}</Alert>;
  if (Array.isArray(state.data) && state.data.length === 0) return <EmptyState title={empty} />;
  return children(state.data);
}

function ProfitLoss({ state }: { state: ReturnType<typeof useAsync<Awaited<ReturnType<typeof api.reports.profitAndLoss>>>> }): JSX.Element {
  return (
    <AsyncPane state={state} empty="No profit and loss activity">
      {(rows) => {
        const typed = rows as ProfitAndLossRow[];
        const ladder = summariseProfitAndLoss(typed);
        return (
          <table className="dtable">
            <tbody>
              {ladder.map((row) => (
                <tr key={row.label} style={{ cursor: 'default' }}>
                  <td style={{ fontWeight: row.kind === 'section' ? 500 : 700 }}>{row.label}</td>
                  <td className={`num${row.kind !== 'section' ? ' strong' : ''}`}>{signedMoney(row.amount_pesewas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      }}
    </AsyncPane>
  );
}

function BalanceSheet({ state }: { state: ReturnType<typeof useAsync<Awaited<ReturnType<typeof api.reports.balanceSheet>>>> }): JSX.Element {
  return (
    <AsyncPane state={state} empty="No balance sheet activity">
      {(report) => {
        const rows = report.rows as BalanceSheetRow[];
        return (
          <div>
            {report.out_of_balance_pesewas !== 0 && (
              <Alert tone="bad" eyebrow="Out of balance" title={`Balance sheet is out by ${signedMoney(report.out_of_balance_pesewas)}`}>
                Review posted journal entries before relying on this statement.
              </Alert>
            )}
            {(['asset', 'liability', 'equity'] as const).map((type) => (
              <table key={type} className="dtable">
                <thead><tr><th>{type === 'asset' ? 'Assets' : type === 'liability' ? 'Liabilities' : 'Equity'}</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {rows.filter((r) => r.account_type === type).map((r) => (
                    <tr key={r.account_id} style={{ cursor: 'default' }}>
                      <td><span className="mono faint">{r.code}</span> {r.name}{r.computed ? <span className="faint"> · computed</span> : null}</td>
                      <td className="num">{signedMoney(r.amount_pesewas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        );
      }}
    </AsyncPane>
  );
}

function ArAging({ state }: { state: ReturnType<typeof useAsync<Awaited<ReturnType<typeof api.reports.arAging>>>> }): JSX.Element {
  return (
    <AsyncPane state={state} empty="No open receivables">
      {(rows) => (
        <table className="dtable">
          <thead><tr><th>Invoice</th><th>Customer</th><th>Due</th><th>Bucket</th><th className="num">Balance</th></tr></thead>
          <tbody>{(rows as ArAgingRow[]).map((r) => (
            <tr key={r.invoice_id} style={{ cursor: 'default' }}>
              <td className="mono">{r.invoice_number}</td>
              <td>{r.customer_name}</td>
              <td>{r.due_at ? formatDate(r.due_at) : formatDate(r.issued_at)}</td>
              <td>{AGING_BUCKET_LABELS[r.bucket]}</td>
              <td className="num">{formatGhs(r.balance_pesewas)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </AsyncPane>
  );
}

function OpenInvoices({ state }: { state: ReturnType<typeof useAsync<Awaited<ReturnType<typeof api.invoices.list>>>> }): JSX.Element {
  return (
    <AsyncPane state={state} empty="No open invoices">
      {(rows) => {
        const open = (rows as InvoiceListRow[]).filter((r) => r.balance_due_pesewas > 0);
        if (open.length === 0) return <EmptyState title="No open invoices" />;
        return (
          <table className="dtable">
            <thead><tr><th>Invoice</th><th>Customer</th><th>Due</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Balance</th></tr></thead>
            <tbody>{open.map((r) => (
              <tr key={r.id} style={{ cursor: 'default' }}>
                <td><Link to={paths.invoices.detail(r.id)} className="mono">{r.number}</Link></td>
                <td>{customerName(r)}</td>
                <td>{r.due_at ? formatDate(r.due_at) : <span className="faint">--</span>}</td>
                <td className="num">{formatGhs(r.total_pesewas)}</td>
                <td className="num">{formatGhs(r.amount_paid_pesewas)}</td>
                <td className="num strong">{formatGhs(r.balance_due_pesewas)}</td>
              </tr>
            ))}</tbody>
          </table>
        );
      }}
    </AsyncPane>
  );
}

function TrialBalance({ state }: { state: ReturnType<typeof useAsync<Awaited<ReturnType<typeof api.reports.trialBalance>>>> }): JSX.Element {
  return (
    <AsyncPane state={state} empty="No trial balance activity">
      {(rows) => (
        <table className="dtable">
          <thead><tr><th>Account</th><th>Type</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th></tr></thead>
          <tbody>{(rows as TrialBalanceRow[]).map((r) => (
            <tr key={r.account_id} style={{ cursor: 'default' }}>
              <td><span className="mono faint">{r.code}</span> {r.name}</td>
              <td>{r.account_type}</td>
              <td className="num">{r.debit_pesewas ? formatGhs(r.debit_pesewas) : <span className="faint">--</span>}</td>
              <td className="num">{r.credit_pesewas ? formatGhs(r.credit_pesewas) : <span className="faint">--</span>}</td>
              <td className="num">{r.balance_side === 'zero' ? formatGhs(0) : `${formatGhs(r.balance_pesewas)} ${r.balance_side}`}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </AsyncPane>
  );
}

function Journal({ state }: { state: ReturnType<typeof useAsync<Awaited<ReturnType<typeof api.reports.generalLedger>>>> }): JSX.Element {
  return (
    <AsyncPane state={state} empty="No journal activity">
      {(rows) => (
        <table className="dtable">
          <thead><tr><th>Date</th><th>No.</th><th>Memo</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Running</th></tr></thead>
          <tbody>{(rows as LedgerRow[]).map((r) => (
            <tr key={r.line_id} style={{ cursor: 'default' }}>
              <td>{formatDate(r.entry_date)}</td>
              <td className="mono">{r.entry_no}</td>
              <td>{r.memo || <span className="faint">--</span>}</td>
              <td className="num">{r.debit_pesewas ? formatGhs(r.debit_pesewas) : <span className="faint">--</span>}</td>
              <td className="num">{r.credit_pesewas ? formatGhs(r.credit_pesewas) : <span className="faint">--</span>}</td>
              <td className="num">{signedMoney(r.running_balance_pesewas)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </AsyncPane>
  );
}

function AccountList({ state }: { state: ReturnType<typeof useAsync<Awaited<ReturnType<typeof api.accounts.list>>>> }): JSX.Element {
  return (
    <AsyncPane state={state} empty="No accounts found">
      {(rows) => (
        <table className="dtable">
          <thead><tr><th>Account</th><th>Type</th><th>Classification</th><th>Status</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} style={{ cursor: 'default', opacity: r.is_active ? 1 : 0.6 }}>
              <td><span className="mono faint">{r.code}</span> {r.name}</td>
              <td>{r.account_type}</td>
              <td>{r.classification.replaceAll('_', ' ')}</td>
              <td>{r.is_active ? 'Active' : 'Inactive'}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </AsyncPane>
  );
}

function Utilization({ state }: { state: ReturnType<typeof useAsync<Awaited<ReturnType<typeof api.reports.utilization>>>> }): JSX.Element {
  return (
    <AsyncPane state={state} empty="No utilization yet">
      {(rows) => (
        <table className="dtable">
          <thead><tr><th>Item</th><th>Kind</th><th className="num">Days</th><th className="num">Utilization</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.item_id} style={{ cursor: 'default' }}>
              <td>{r.item_name}</td>
              <td>{r.kind.replace('_', ' ')}</td>
              <td className="num">{r.booked_quantity_days}</td>
              <td className="num strong">{r.utilization_percent}%</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </AsyncPane>
  );
}

function TopCustomers({ state }: { state: ReturnType<typeof useAsync<Awaited<ReturnType<typeof api.reports.topCustomers>>>> }): JSX.Element {
  return (
    <AsyncPane state={state} empty="No customer revenue yet">
      {(rows) => (
        <table className="dtable">
          <thead><tr><th>Customer</th><th className="num">Bookings</th><th className="num">Revenue</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.customer_id} style={{ cursor: 'default' }}>
              <td>{r.customer_name}</td>
              <td className="num">{r.bookings}</td>
              <td className="num strong">{formatGhs(r.revenue_pesewas)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </AsyncPane>
  );
}

function TripLog({ state }: { state: ReturnType<typeof useAsync<Awaited<ReturnType<typeof api.reports.tripLog>>>> }): JSX.Element {
  return (
    <AsyncPane state={state} empty="No trips yet">
      {(rows) => (
        <table className="dtable">
          <thead><tr><th>Customer</th><th>Vehicle</th><th>When</th><th>Driver</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={`${r.booking_id}-${r.item_name}`} style={{ cursor: 'default' }}>
              <td>{r.customer_name}</td>
              <td>{r.item_name}{r.plate ? <span className="muted mono"> · {r.plate}</span> : ''}</td>
              <td>{formatDate(r.starts_at)}</td>
              <td>{r.driver_name ?? <span className="faint">Unassigned</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </AsyncPane>
  );
}

function Revenue({ state }: { state: ReturnType<typeof useAsync<Awaited<ReturnType<typeof api.reports.overview>>>> }): JSX.Element {
  return (
    <AsyncPane state={state} empty="No revenue yet">
      {(o) => (
        <section className="grid-3" style={{ padding: 'var(--s-4)' }}>
          <Metric label="Today" value={formatGhs(o.revenue_today_pesewas)} mono />
          <Metric label="Last 7 days" value={formatGhs(o.revenue_week_pesewas)} mono />
          <Metric label="This month" value={formatGhs(o.revenue_month_pesewas)} mono />
          <Metric label="Outstanding" value={formatGhs(o.outstanding_pesewas)} mono />
          <Metric label="Active bookings" value={o.active_bookings.toLocaleString('en-GB')} />
          <Metric label="Damage balance" value={formatGhs(o.open_damage_pesewas)} mono />
        </section>
      )}
    </AsyncPane>
  );
}

function Metric({ label, value, mono }: { label: string; value: string | null; mono?: boolean }): JSX.Element {
  return (
    <div className="card">
      <div className="page-eyebrow" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: mono ? 'var(--font-mono)' : 'var(--font-display)', fontSize: mono ? 22 : 26, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.2 }}>
        {value === null ? <Skeleton width={110} height={22} /> : value}
      </div>
    </div>
  );
}
