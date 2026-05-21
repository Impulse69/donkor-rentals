import { Link } from 'react-router-dom';
import { useAsync } from '../lib/useAsync';
import { api } from '../lib/api';
import { formatGhs } from '../lib/format';
import { paths } from '../router/paths';
import { Skeleton } from '../components/Skeleton';

export default function Dashboard(): JSX.Element {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const items = useAsync(() => api.catalog.list({}), []);
  const customers = useAsync(() => api.customers.list({}), []);
  const activeBookings = useAsync(
    () =>
      Promise.all([
        api.bookings.list({ status: 'reserved' }),
        api.bookings.list({ status: 'out' }),
      ]).then(([rs, os]) => [...rs, ...os]),
    [],
  );
  const outstanding = useAsync(
    () =>
      Promise.all([
        api.invoices.list({ status: 'issued' }),
        api.invoices.list({ status: 'draft' }),
      ]).then(([a, b]) => [...a, ...b]),
    [],
  );
  const overview = useAsync(() => api.reports.overview(), []);

  const customerCount = customers.status === 'ok' ? customers.data.length : null;
  const fleetCount = items.status === 'ok' ? items.data.filter((i) => i.kind === 'hearse').length : null;
  const supplyCount = items.status === 'ok'
    ? items.data.filter((i) => i.kind === 'party_supply').reduce((sum, i) => sum + i.total_quantity, 0)
    : null;
  const portfolioValue = items.status === 'ok'
    ? items.data.reduce((sum, i) => sum + i.replacement_value_pesewas * i.total_quantity, 0)
    : null;
  const activeCount = activeBookings.status === 'ok' ? activeBookings.data.length : null;
  const outstandingTotal = outstanding.status === 'ok'
    ? outstanding.data.reduce((sum, r) => sum + r.balance_due_pesewas, 0)
    : null;
  const todayRevenue = overview.status === 'ok' ? overview.data.revenue_today_pesewas : null;

  return (
    <div className="page fade-up">
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Workspace · Today</div>
          <h1 className="page-title">{greeting}.</h1>
          <p className="muted" style={{ maxWidth: 560, marginTop: 8, lineHeight: 1.55 }}>
            Active bookings, outstanding receivables, and inventory at a glance. Jump to
            any module from the sidebar.
          </p>
        </div>
        <div className="page-actions">
          <Link to={paths.bookings.new}><button type="button" className="btn btn-primary btn-md">+ New booking</button></Link>
        </div>
      </header>

      <section className="grid-3 fade-up fade-up-1">
        <Stat
          label="Active bookings"
          value={activeCount === null ? null : activeCount.toLocaleString('en-GB')}
          hint="Reserved or on the road"
          to={paths.bookings.list}
        />
        <Stat
          label="Outstanding receivables"
          value={outstandingTotal === null ? null : formatGhs(outstandingTotal)}
          hint="Across draft + issued invoices"
          to={paths.invoices.list}
          mono
        />
        <Stat
          label="Revenue today"
          value={todayRevenue === null ? null : formatGhs(todayRevenue)}
          hint="Payments minus refunds"
          to="/reports"
          mono
        />
      </section>

      <section className="card fade-up fade-up-2">
        <div className="row-between" style={{ marginBottom: 14 }}>
          <h3 className="card-title" style={{ margin: 0 }}>Inventory at a glance</h3>
          <Link to={paths.catalog.list} style={{ fontSize: 13 }}>Open catalog →</Link>
        </div>
        <div className="grid-2">
          <KV label="Party-supply units in pool" value={supplyCount === null ? null : supplyCount.toLocaleString('en-GB')} />
          <KV label="Hearses on the books" value={fleetCount === null ? null : String(fleetCount)} />
          <KV label="Replacement value (est.)" value={portfolioValue === null ? null : formatGhs(portfolioValue)} mono />
          <KV label="Customers on file" value={customerCount === null ? null : customerCount.toLocaleString('en-GB')} />
        </div>
      </section>

      <section className="card fade-up fade-up-3">
        <span className="eyebrow">Reports</span>
        <h3 style={{ marginTop: 6, marginBottom: 6 }}>Revenue, utilization, trips, and damage</h3>
        <p className="muted" style={{ maxWidth: 600, lineHeight: 1.55, margin: 0 }}>
          The reports workspace rolls up payments, balances, item utilization, hearse trips,
          and damage charges with CSV export for owner review.
        </p>
        <div style={{ marginTop: 14 }}>
          <Link to="/reports"><button type="button" className="btn btn-md">Open reports</button></Link>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  to,
  mono,
}: {
  label: string;
  value: string | null;
  hint?: string;
  to?: string;
  mono?: boolean;
}): JSX.Element {
  const inner = (
    <div className="card" style={{ height: '100%' }}>
      <div className="page-eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div
        style={{
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-display)',
          fontSize: mono ? 26 : 32,
          lineHeight: 1.1,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          color: 'var(--ink)',
        }}
      >
        {value === null ? <Skeleton width={120} height={28} /> : value}
      </div>
      {hint && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{hint}</div>}
    </div>
  );
  return to ? (
    <Link to={to} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      {inner}
    </Link>
  ) : inner;
}

function KV({ label, value, mono }: { label: string; value: string | null; mono?: boolean }): JSX.Element {
  return (
    <div className="kv-stack">
      <span className="k">{label}</span>
      <span className="v" style={{ fontFamily: mono === false ? 'var(--font-body)' : undefined }}>
        {value === null ? <Skeleton width={80} height={12} /> : value}
      </span>
    </div>
  );
}
