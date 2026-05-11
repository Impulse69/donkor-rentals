import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { formatDate, formatGhs } from '../lib/format';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { EmptyState } from '../components/EmptyState';
import { Alert } from '../components/Alert';
import { KV } from '../components/KV';
import { useToast } from '../components/Toast';

export default function Reports(): JSX.Element {
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const range = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    return { start: start.toISOString(), end: end.toISOString() };
  }, []);
  const overview = useAsync(() => api.reports.overview(), []);
  const utilization = useAsync(() => api.reports.utilization(range.start, range.end), [range.start, range.end]);
  const topCustomers = useAsync(() => api.reports.topCustomers(8), []);
  const trips = useAsync(() => api.reports.tripLog(12), []);
  const damage = useAsync(() => api.reports.damageSummary(), []);

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

  if (overview.status === 'error') return <Alert tone="bad" eyebrow="Reports">{overview.error.message}</Alert>;
  const o = overview.status === 'ok' ? overview.data : null;

  return (
    <div className="page fade-up" style={{ maxWidth: 1240 }}>
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Workspace · Reports</div>
          <h1 className="page-title" style={{ fontStyle: 'normal' }}>Revenue and operations</h1>
          <p className="muted" style={{ maxWidth: 620, marginTop: 8 }}>
            Revenue, utilization, outstanding balances, hearse trips, and damage charges.
          </p>
        </div>
        <div className="page-actions">
          <Button onClick={() => { void exportCsv(); }} loading={exporting}>Export CSV</Button>
        </div>
      </header>

      <section className="grid-3 fade-up fade-up-1">
        <Metric label="Today" value={o ? formatGhs(o.revenue_today_pesewas) : null} />
        <Metric label="Last 7 days" value={o ? formatGhs(o.revenue_week_pesewas) : null} />
        <Metric label="This month" value={o ? formatGhs(o.revenue_month_pesewas) : null} />
        <Metric label="Outstanding" value={o ? formatGhs(o.outstanding_pesewas) : null} />
        <Metric label="Active bookings" value={o ? o.active_bookings.toLocaleString('en-GB') : null} />
        <Metric label="Damage balance" value={o ? formatGhs(o.open_damage_pesewas) : null} />
      </section>

      <section className="grid-2 fade-up fade-up-2">
        <ReportTable title="Utilization" loading={utilization.status === 'loading'}>
          {utilization.status === 'ok' && utilization.data.length > 0 ? (
            <table className="dtable">
              <thead><tr><th>Item</th><th>Kind</th><th className="num">Booked days</th><th className="num">Utilization</th></tr></thead>
              <tbody>
                {utilization.data.slice(0, 8).map((row) => (
                  <tr key={row.item_id} style={{ cursor: 'default' }}>
                    <td>{row.item_name}</td>
                    <td>{row.kind.replace('_', ' ')}</td>
                    <td className="num">{row.booked_quantity_days}</td>
                    <td className="num">{row.utilization_percent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <EmptyState title="No utilization yet" />}
        </ReportTable>

        <ReportTable title="Top customers" loading={topCustomers.status === 'loading'}>
          {topCustomers.status === 'ok' && topCustomers.data.length > 0 ? (
            <table className="dtable">
              <thead><tr><th>Customer</th><th className="num">Bookings</th><th className="num">Revenue</th></tr></thead>
              <tbody>
                {topCustomers.data.map((row) => (
                  <tr key={row.customer_id} style={{ cursor: 'default' }}>
                    <td>{row.customer_name}</td>
                    <td className="num">{row.bookings}</td>
                    <td className="num">{formatGhs(row.revenue_pesewas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <EmptyState title="No customer revenue yet" />}
        </ReportTable>
      </section>

      <section className="grid-2 fade-up fade-up-3">
        <ReportTable title="Hearse trip log" loading={trips.status === 'loading'}>
          {trips.status === 'ok' && trips.data.length > 0 ? (
            <table className="dtable">
              <thead><tr><th>Customer</th><th>Vehicle</th><th>When</th><th>Driver</th></tr></thead>
              <tbody>
                {trips.data.map((row) => (
                  <tr key={`${row.booking_id}-${row.item_name}`} style={{ cursor: 'default' }}>
                    <td>{row.customer_name}</td>
                    <td>{row.item_name}{row.plate ? ` · ${row.plate}` : ''}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{formatDate(row.starts_at)}</td>
                    <td>{row.driver_name ?? <span className="faint">Unassigned</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <EmptyState title="No hearse trips yet" />}
        </ReportTable>

        <ReportTable title="Damage summary" loading={damage.status === 'loading'}>
          {damage.status === 'ok' && damage.data.length > 0 ? (
            <table className="dtable">
              <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Charges</th><th className="num">Write-offs</th></tr></thead>
              <tbody>
                {damage.data.map((row) => (
                  <tr key={row.item_id} style={{ cursor: 'default' }}>
                    <td>{row.item_name}</td>
                    <td className="num">{row.damaged_quantity}</td>
                    <td className="num">{formatGhs(row.charges_pesewas)}</td>
                    <td className="num">{row.write_offs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <EmptyState title="No damage recorded" />}
        </ReportTable>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | null }): JSX.Element {
  return (
    <div className="card">
      {value === null ? <Spinner /> : <KV label={label} value={value} />}
    </div>
  );
}

function ReportTable({
  title,
  loading,
  children,
}: {
  title: string;
  loading: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="card card-flush">
      <div className="row-between" style={{ padding: '16px 18px', borderBottom: '1px solid var(--rule)' }}>
        <h3 className="card-title" style={{ margin: 0 }}>{title}</h3>
        {loading && <Spinner />}
      </div>
      <div>{children}</div>
    </section>
  );
}
