import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { api } from '../../lib/api';
import { paths } from '../../router/paths';
import { formatGhs, formatDate } from '../../lib/format';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { AsyncList } from '../../components/AsyncList';
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from '@shared/schemas';
import { invoiceStatusTone } from './helpers';

const STATUS_OPTIONS: ReadonlyArray<{ value: InvoiceStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'issued', label: 'Issued' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
];

export default function InvoicesList(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const status = (searchParams.get('status') ?? 'all') as InvoiceStatus | 'all';

  const list = useAsync(
    () => api.invoices.list({ ...(status !== 'all' ? { status: status as InvoiceStatus } : {}) }),
    [status],
  );

  function setParam(name: string, value: string): void {
    const next = new URLSearchParams(searchParams);
    if (value === '' || value === 'all') next.delete(name);
    else next.set(name, value);
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="page fade-up">
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Operations · Receivables</div>
          <h1 className="page-title">Invoices</h1>
          <p className="muted" style={{ marginTop: 8, maxWidth: 540 }}>
            Bills issued against bookings, the deposits and payments against them, and what is
            still owed. Generate a new one from any booking.
          </p>
        </div>
      </header>

      <div className="page-toolbar fade-up fade-up-1">
        <select
          className="select"
          style={{ width: 180 }}
          value={status}
          onChange={(e) => setParam('status', e.target.value)}
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="fade-up fade-up-2">
        <AsyncList
          state={list}
          loadingLabel="Pulling the ledger…"
          emptyTitle="No invoices yet"
          emptyBody="Generate the first invoice from a booking detail page."
          emptyAction={<Link to={paths.bookings.list}><Button variant="primary">Open bookings</Button></Link>}
        >
          {(rows) => (
            <div className="dtable-wrap">
              <table className="dtable">
                <thead>
                  <tr>
                    <th style={{ width: 130 }}>Number</th>
                    <th style={{ width: 100 }}>Status</th>
                    <th>Customer</th>
                    <th>Issued</th>
                    <th className="num">Total</th>
                    <th className="num">Paid</th>
                    <th className="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} onClick={() => navigate(paths.invoices.detail(r.id))}>
                      <td className="mono">{r.number}</td>
                      <td><Badge tone={invoiceStatusTone(r.status)}>{INVOICE_STATUS_LABELS[r.status]}</Badge></td>
                      <td><span style={{ fontWeight: 500 }}>{r.customer_name}</span></td>
                      <td className="mono" style={{ fontSize: 13 }}>{r.issued_at ? formatDate(r.issued_at) : <span className="faint">—</span>}</td>
                      <td className="num">{formatGhs(r.total_pesewas)}</td>
                      <td className="num">{formatGhs(r.amount_paid_pesewas)}</td>
                      <td className="num" style={{ fontWeight: r.balance_due_pesewas > 0 ? 600 : 400 }}>
                        {formatGhs(r.balance_due_pesewas)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AsyncList>
      </div>
    </div>
  );
}
