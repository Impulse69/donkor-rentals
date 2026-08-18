import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { api } from '../../lib/api';
import { paths } from '../../router/paths';
import { formatGhs, formatDate } from '../../lib/format';
import { Button, SplitButton } from '../../components/Button';
import { Dropdown } from '../../components/Dropdown';
import { EmptyState } from '../../components/EmptyState';
import { AsyncList } from '../../components/AsyncList';
import { MoneyBar, type MoneyBarEntry } from '../../components/MoneyBar';
import { StatusPill, type StatusPillStatus } from '../../components/StatusPill';
import { type InvoiceStatus } from '@shared/schemas';

const STATUS_OPTIONS: ReadonlyArray<{ value: InvoiceStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'issued', label: 'Issued' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
];

type ReceivableView = 'overdue' | 'not-due' | 'paid';

interface InvoiceRowLike {
  status: InvoiceStatus;
  due_at: string | null;
  balance_due_pesewas: number;
}

interface InvoiceListRow extends InvoiceRowLike {
  id: string;
  booking_id: string | null;
  number: string;
  issued_at: string | null;
  customer_name?: string | null;
  renter_name?: string | null;
  total_pesewas: number;
  amount_paid_pesewas: number;
}

function isOverdue(row: InvoiceRowLike, now: number): boolean {
  if (row.status !== 'issued' || row.balance_due_pesewas <= 0 || !row.due_at) return false;
  return new Date(row.due_at).getTime() < now;
}

function rowStatus(row: InvoiceRowLike, now: number): StatusPillStatus {
  return isOverdue(row, now) ? 'overdue' : row.status;
}

function customerLabel(row: { customer_name?: string | null; renter_name?: string | null }): string {
  return row.customer_name?.trim() || row.renter_name?.trim() || 'Walk-in rental';
}

export default function InvoicesList(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const status = (searchParams.get('status') ?? 'all') as InvoiceStatus | 'all';
  const view = searchParams.get('view') as ReceivableView | null;
  const search = searchParams.get('q') ?? '';
  const [draft, setDraft] = useState(search);

  const list = useAsync(
    () => api.invoices.list({
      ...(status !== 'all'
        ? { status: status as InvoiceStatus }
        : view === 'paid'
          ? { status: 'paid' as InvoiceStatus }
          : view === 'overdue' || view === 'not-due'
            ? { status: 'issued' as InvoiceStatus }
            : {}),
      ...(search ? { search } : {}),
    }),
    [status, search, view],
  );
  const all = useAsync(() => api.invoices.list({}), []);

  function setParam(name: string, value: string): void {
    const next = new URLSearchParams(searchParams);
    if (value === '' || value === 'all') next.delete(name);
    else next.set(name, value);
    if (name === 'status') next.delete('view');
    setSearchParams(next, { replace: true });
  }

  function setReceivableView(nextView: ReceivableView): void {
    const next = new URLSearchParams(searchParams);
    next.set('view', nextView);
    next.delete('status');
    setSearchParams(next, { replace: true });
  }

  function submitSearch(e: React.FormEvent): void {
    e.preventDefault();
    setParam('q', draft.trim());
  }

  const summary = useMemo<MoneyBarEntry[]>(() => {
    const rows = all.status === 'ok' ? all.data : [];
    const now = Date.now();
    let overdue = 0;
    let notDue = 0;
    let paid = 0;
    for (const r of rows) {
      if (r.status === 'void' || r.status === 'draft') continue;
      if (isOverdue(r, now)) overdue += r.balance_due_pesewas;
      else if (r.balance_due_pesewas > 0) notDue += r.balance_due_pesewas;
      paid += r.amount_paid_pesewas;
    }
    return [
      { label: 'Overdue', amountPesewas: overdue, tone: 'bad', onClick: () => setReceivableView('overdue') },
      { label: 'Not due yet', amountPesewas: notDue, tone: 'info', onClick: () => setReceivableView('not-due') },
      { label: 'Paid', amountPesewas: paid, tone: 'ok', onClick: () => setReceivableView('paid') },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all.status, all.status === 'ok' ? all.data : null, searchParams]);

  const now = Date.now();
  const activeFilterLabel = view === 'overdue' ? 'overdue'
    : view === 'not-due' ? 'not due yet'
      : view === 'paid' ? 'paid'
        : status !== 'all' ? status
          : null;

  return (
    <div className="page fade-up">
      <header className="page-head">
        <div>
          <h1 className="page-title">Invoices</h1>
        </div>
        <div className="page-actions">
          <Link to={paths.invoices.new}>
            <Button variant="primary">New invoice</Button>
          </Link>
        </div>
      </header>

      <div className="fade-up fade-up-1" style={{ marginBottom: 'var(--s-5)' }}>
        <MoneyBar entries={summary} ariaLabel="Receivables summary" />
      </div>

      <form key={search} className="dtable-toolbar fade-up fade-up-1" onSubmit={submitSearch}>
        <input
          className="input"
          style={{ flex: '1 1 0', minWidth: 0 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search by client name or invoice number..."
          aria-label="Search invoices"
        />
        <select
          className="select"
          style={{ width: 180 }}
          value={status}
          onChange={(e) => setParam('status', e.target.value)}
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <Button type="submit">Apply</Button>
        {(search || status !== 'all' || view) && (
          <Button
            variant="ghost"
            type="button"
            onClick={() => { setDraft(''); setSearchParams({}, { replace: true }); }}
          >
            Clear
          </Button>
        )}
      </form>

      <div className="fade-up fade-up-2">
        <AsyncList
          state={list}
          loadingLabel="Pulling the ledger..."
          emptyTitle={search || status !== 'all' || view ? 'No matching invoices' : 'No invoices yet'}
          emptyBody={search
            ? `Nothing matches "${search}". Try a different name or invoice number.`
            : activeFilterLabel
              ? `Nothing is ${activeFilterLabel}. Try a different filter or generate a new invoice from a booking.`
              : 'Generate the first invoice from a booking detail page.'}
          emptyAction={<Link to={paths.bookings.list}><Button variant="primary">Open bookings</Button></Link>}
        >
          {(rows) => {
            const filteredRows = (rows as InvoiceListRow[]).filter((row) => {
              if (view === 'overdue') return isOverdue(row, now);
              if (view === 'not-due') return row.status === 'issued' && row.balance_due_pesewas > 0 && !isOverdue(row, now);
              return true;
            });

            if (filteredRows.length === 0) {
              return (
                <EmptyState
                  title="No matching invoices"
                  body={activeFilterLabel
                    ? `Nothing is ${activeFilterLabel}. Try a different filter or clear the current view.`
                    : 'Try a different search or status.'}
                />
              );
            }

            return (
              <div className="dtable-wrap">
                <table className="dtable">
                  <thead>
                    <tr>
                      <th style={{ width: 130 }}>No.</th>
                      <th>Customer</th>
                      <th style={{ width: 120 }}>Invoice date</th>
                      <th style={{ width: 120 }}>Due date</th>
                      <th className="num" style={{ width: 120 }}>Total</th>
                      <th className="num" style={{ width: 120 }}>Balance</th>
                      <th style={{ width: 110 }}>Status</th>
                      <th style={{ width: 190 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((r) => (
                      <tr key={r.id} onClick={() => navigate(paths.invoices.detail(r.id))}>
                        <td className="mono">{r.number}</td>
                        <td><span style={{ fontWeight: 500 }}>{customerLabel(r)}</span></td>
                        <td className="mono" style={{ fontSize: 13 }}>
                          {r.issued_at ? formatDate(r.issued_at) : <span className="faint">--</span>}
                        </td>
                        <td className="mono" style={{ fontSize: 13 }}>
                          {r.due_at ? formatDate(r.due_at) : <span className="faint">--</span>}
                        </td>
                        <td className="num">{formatGhs(r.total_pesewas)}</td>
                        <td className="num" style={{ fontWeight: r.balance_due_pesewas > 0 ? 600 : 400 }}>
                          {formatGhs(r.balance_due_pesewas)}
                        </td>
                        <td><StatusPill status={rowStatus(r, now)} /></td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <SplitButton
                            size="sm"
                            onClick={() => navigate(paths.invoices.detail(r.id))}
                            menu={
                              <>
                                <Dropdown.Item onSelect={() => navigate(paths.invoices.detail(r.id))}>
                                  View
                                </Dropdown.Item>
                                <Dropdown.Item onSelect={() => navigate(paths.invoices.detail(r.id))}>
                                  Print
                                </Dropdown.Item>
                                {r.status !== 'void' && r.status !== 'paid' && (
                                  <Dropdown.Item onSelect={() => navigate(paths.invoices.detail(r.id))}>
                                    Void
                                  </Dropdown.Item>
                                )}
                                {r.booking_id && (
                                  <Dropdown.Item onSelect={() => navigate(paths.bookings.detail(r.booking_id))}>
                                    Open booking
                                  </Dropdown.Item>
                                )}
                              </>
                            }
                          >
                            {r.balance_due_pesewas > 0 ? 'Receive payment' : 'View'}
                          </SplitButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }}
        </AsyncList>
      </div>
    </div>
  );
}
