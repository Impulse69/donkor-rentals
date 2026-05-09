import { Link } from 'react-router-dom';
import { useAsync } from '../lib/useAsync';
import { api } from '../lib/api';
import { formatGhs } from '../lib/format';
import { paths } from '../router/paths';
import { Spinner } from '../components/Spinner';

export default function Dashboard(): JSX.Element {
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

  const itemCount = items.status === 'ok' ? items.data.length : 0;
  const customerCount = customers.status === 'ok' ? customers.data.length : 0;
  const fleetCount = items.status === 'ok' ? items.data.filter((i) => i.kind === 'hearse').length : 0;
  const supplyCount = items.status === 'ok'
    ? items.data.filter((i) => i.kind === 'party_supply').reduce((sum, i) => sum + i.total_quantity, 0)
    : 0;
  const portfolioValue = items.status === 'ok'
    ? items.data.reduce((sum, i) => sum + i.replacement_value_pesewas * i.total_quantity, 0)
    : 0;
  const activeCount = activeBookings.status === 'ok' ? activeBookings.data.length : 0;

  return (
    <div className="page fade-up">
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Workspace · Today</div>
          <h1 className="page-title">Good morning.</h1>
          <p className="muted" style={{ maxWidth: 540, marginTop: 8 }}>
            A quiet desk. Use the catalog to register what you rent out, and customers to keep their
            details handy. Bookings, invoices and sync arrive in the next phases.
          </p>
        </div>
      </header>

      <section className="grid-3 fade-up fade-up-1">
        <Stat label="Active bookings" value={activeBookings.status === 'ok' ? activeCount : null} hint="Reserved or on the road" to={paths.bookings.list} />
        <Stat label="Catalog items" value={items.status === 'ok' ? itemCount : null} hint="Across both lines" to={paths.catalog.list} />
        <Stat label="Customers on file" value={customers.status === 'ok' ? customerCount : null} hint="Past and present" to={paths.customers.list} />
      </section>

      <section className="card fade-up fade-up-2">
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Inventory at a glance</h3>
          <Link to={paths.catalog.list} className="muted" style={{ fontSize: 13 }}>Open catalog →</Link>
        </div>
        <div className="grid-2">
          <KV label="Party-supply units in pool" value={supplyCount.toLocaleString('en-GB')} />
          <KV label="Hearses on the books" value={String(fleetCount)} />
          <KV label="Replacement value (est.)" value={formatGhs(portfolioValue)} />
          <KV label="Modules online" value="Catalog · Customers" />
        </div>
      </section>

      <section className="card card-warm fade-up fade-up-3">
        <span className="eyebrow">Roadmap</span>
        <h3 style={{ marginTop: 6 }}>Next: Invoicing & Payments</h3>
        <p className="muted" style={{ maxWidth: 600 }}>
          Phase 3 turns the booking quote into an invoice, takes deposits and partial payments
          against it, and prints a receipt. PDFs and damage reconciliation follow.
        </p>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  to,
}: {
  label: string;
  value: number | null;
  hint?: string;
  to?: string;
}): JSX.Element {
  const inner = (
    <div className="card" style={{ height: '100%' }}>
      <div className="page-eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 44, lineHeight: 1, fontWeight: 400 }}>
        {value === null ? <Spinner /> : value.toLocaleString('en-GB')}
      </div>
      {hint && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{hint}</div>}
    </div>
  );
  return to ? <Link to={to} style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</Link> : inner;
}

function KV({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="kv-stack">
      <span className="k">{label}</span>
      <span className="v">{value}</span>
    </div>
  );
}
