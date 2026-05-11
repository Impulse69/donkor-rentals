import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { formatDate, formatGhs } from '../../lib/format';
import { Button } from '../../components/Button';
import { Alert } from '../../components/Alert';
import { EmptyState } from '../../components/EmptyState';
import { Spinner } from '../../components/Spinner';

export default function ReturnsList(): JSX.Element {
  const navigate = useNavigate();
  const returns = useAsync(() => api.returns.list(), []);

  if (returns.status === 'error') return <Alert tone="bad" eyebrow="Returns">{returns.error.message}</Alert>;

  const rows = returns.status === 'ok' ? returns.data : [];

  return (
    <div className="page fade-up">
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Operations · Returns</div>
          <h1 className="page-title" style={{ fontStyle: 'normal' }}>Damage and deposits</h1>
          <p className="muted" style={{ maxWidth: 620, marginTop: 8 }}>
            Completed return inspections, deposit deductions, refunds, and outstanding damage balances.
          </p>
        </div>
      </header>

      <section className="card card-flush">
        {returns.status === 'loading' ? (
          <div className="row" style={{ justifyContent: 'center', padding: 48 }}><Spinner /></div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No returns yet"
            body="Open a booking and record a return once inventory is back."
            actions={<Link to="/bookings"><Button variant="primary">Open bookings</Button></Link>}
          />
        ) : (
          <div className="dtable-wrap" style={{ border: 0 }}>
            <table className="dtable">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Returned</th>
                  <th className="num">Charges</th>
                  <th className="num">Refund</th>
                  <th className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} onClick={() => navigate(`/returns/new/${row.booking_id}`)}>
                    <td>{row.customer_name}</td>
                    <td className="mono" style={{ fontSize: 13 }}>{formatDate(row.returned_at)}</td>
                    <td className="num">{formatGhs(row.total_charges_pesewas)}</td>
                    <td className="num">{formatGhs(row.refund_pesewas)}</td>
                    <td className="num">{formatGhs(row.balance_due_pesewas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
