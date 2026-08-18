import { Link, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { useAsync } from '../lib/useAsync';
import { api } from '../lib/api';
import { formatGhs, formatDate } from '../lib/format';
import { paths } from '../router/paths';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { MoneyBar, type MoneyBarEntry } from '../components/MoneyBar';
import { Skeleton } from '../components/Skeleton';
import { Spinner } from '../components/Spinner';
import { BOOKING_STATUS_LABELS, type BookingStatus } from '@shared/schemas';

interface InvoiceSummaryRow {
  status: 'draft' | 'issued' | 'paid' | 'void';
  due_at: string | null;
  balance_due_pesewas: number;
  amount_paid_pesewas: number;
}

interface BookingRow {
  id: string;
  status: BookingStatus;
  customer_name: string;
  starts_at: string;
  ends_at: string;
  updated_at: string;
}

export default function Dashboard(): JSX.Element {
  const navigate = useNavigate();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const activeBookings = useAsync(
    () =>
      Promise.all([
        api.bookings.list({ status: 'reserved' }),
        api.bookings.list({ status: 'out' }),
      ]).then(([rs, os]) => [...rs, ...os] as BookingRow[]),
    [],
  );
  const invoices = useAsync(() => api.invoices.list({}), []);
  const overview = useAsync(() => api.reports.overview(), []);
  const invoiceRows = useMemo(
    () => (invoices.status === 'ok' ? invoices.data as InvoiceSummaryRow[] : []),
    [invoices.status, invoices.data],
  );
  const bookingRows = useMemo(
    () => (activeBookings.status === 'ok' ? activeBookings.data : []),
    [activeBookings.status, activeBookings.data],
  );

  const receivables = useMemo<MoneyBarEntry[]>(() => {
    const now = Date.now();
    let overdue = 0;
    let notDue = 0;
    let paid = 0;

    for (const row of invoiceRows) {
      if (row.status === 'void' || row.status === 'draft') continue;
      if (isOverdue(row, now)) overdue += row.balance_due_pesewas;
      else if (row.balance_due_pesewas > 0) notDue += row.balance_due_pesewas;
      paid += row.amount_paid_pesewas;
    }

    return [
      { label: 'Overdue', amountPesewas: overdue, tone: 'bad', onClick: () => navigate(`${paths.invoices.list}?view=overdue`) },
      { label: 'Not due yet', amountPesewas: notDue, tone: 'info', onClick: () => navigate(`${paths.invoices.list}?view=not-due`) },
      { label: 'Paid', amountPesewas: paid, tone: 'ok', onClick: () => navigate(`${paths.invoices.list}?view=paid`) },
    ];
  }, [invoiceRows, navigate]);

  const bookingCounts = useMemo(() => {
    return {
      today: bookingRows.filter((row) => overlaps(row, startOfToday(), endOfToday())).length,
      week: bookingRows.filter((row) => overlaps(row, startOfToday(), endOfThisWeek())).length,
    };
  }, [bookingRows]);

  const recent = [...bookingRows].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 6);
  const outstanding = invoices.status === 'ok'
    ? invoiceRows.reduce((sum, row) => sum + row.balance_due_pesewas, 0)
    : null;
  const activeCount = overview.status === 'ok' ? overview.data.active_bookings : null;

  return (
    <div className="page fade-up" style={{ maxWidth: 1240 }}>
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Workspace / Today</div>
          <h1 className="page-title">{greeting}.</h1>
          <p className="muted" style={{ maxWidth: 560, marginTop: 8, lineHeight: 1.55 }}>
            Active bookings, receivables, and recent movement across Donkor & Sons.
          </p>
        </div>
        <div className="page-actions">
          <Link to={paths.bookings.new}><Button variant="primary">New booking</Button></Link>
        </div>
      </header>

      <section className="grid-2 fade-up fade-up-1" style={{ alignItems: 'start' }}>
        <DashboardCard title="Invoices" action={<Link to={paths.invoices.list}>Open invoices</Link>}>
          <MoneyBar entries={receivables} ariaLabel="Receivables summary" />
          <div className="grid-2" style={{ marginTop: 16 }}>
            <Metric label="Outstanding" value={outstanding === null ? null : formatGhs(outstanding)} mono />
            <Metric
              label="Revenue today"
              value={overview.status === 'ok' ? formatGhs(overview.data.revenue_today_pesewas) : null}
              mono
            />
          </div>
        </DashboardCard>

        <DashboardCard title="Bookings" action={<Link to={paths.bookings.list}>Open bookings</Link>}>
          <div className="grid-2">
            <Metric
              label="Today"
              value={activeBookings.status === 'ok' ? bookingCounts.today.toLocaleString('en-GB') : null}
            />
            <Metric
              label="This week"
              value={activeBookings.status === 'ok' ? bookingCounts.week.toLocaleString('en-GB') : null}
            />
            <Metric label="Active" value={activeCount === null ? null : activeCount.toLocaleString('en-GB')} />
          </div>
        </DashboardCard>

        <DashboardCard title="Recent activity" action={<Link to={paths.bookings.list}>View all</Link>}>
          {activeBookings.status === 'loading' && <Spinner />}
          {activeBookings.status === 'ok' && recent.length > 0 ? (
            <table className="dtable">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Starts</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={row.id} onClick={() => navigate(paths.bookings.detail(row.id))}>
                    <td>{row.customer_name}</td>
                    <td>{BOOKING_STATUS_LABELS[row.status]}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{formatDate(row.starts_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : activeBookings.status === 'ok' ? (
            <EmptyState title="No active bookings" body="Reserved and checked-out bookings will appear here." />
          ) : null}
        </DashboardCard>
      </section>
    </div>
  );
}

function DashboardCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="card">
      <div className="row-between" style={{ marginBottom: 14, gap: 12 }}>
        <h3 className="card-title" style={{ margin: 0 }}>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, mono }: { label: string; value: string | null; mono?: boolean }): JSX.Element {
  return (
    <div className="kv-stack">
      <span className="k">{label}</span>
      <span className="v" style={{ fontFamily: mono ? 'var(--font-mono)' : undefined }}>
        {value === null ? <Skeleton width={80} height={14} /> : value}
      </span>
    </div>
  );
}

function isOverdue(row: InvoiceSummaryRow, now: number): boolean {
  if (row.status !== 'issued' || row.balance_due_pesewas <= 0 || !row.due_at) return false;
  return new Date(row.due_at).getTime() < now;
}

function overlaps(row: BookingRow, start: Date, end: Date): boolean {
  return new Date(row.starts_at) < end && new Date(row.ends_at) >= start;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = startOfToday();
  d.setDate(d.getDate() + 1);
  return d;
}

function endOfThisWeek(): Date {
  const d = startOfToday();
  d.setDate(d.getDate() + 7);
  return d;
}
