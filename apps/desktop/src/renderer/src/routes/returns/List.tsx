import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { formatDate, formatGhs } from '../../lib/format';
import { AsyncList } from '../../components/AsyncList';
import { Button } from '../../components/Button';

export default function ReturnsList(): JSX.Element {
  const navigate = useNavigate();
  const returns = useAsync(() => api.returns.list(), []);

  return (
    <div className="page fade-up">
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Operations · Returns</div>
          <h1 className="page-title">Damage and deposits</h1>
          <p className="muted" style={{ maxWidth: 620, marginTop: 8, lineHeight: 1.55 }}>
            Completed return inspections, deposit deductions, refunds, and outstanding damage balances.
          </p>
        </div>
      </header>

      <div className="fade-up fade-up-1">
        <AsyncList
          state={returns}
          emptyTitle="No returns yet"
          emptyBody="Returns appear here once you finish a return inspection on a booking."
          emptyAction={<Link to="/bookings"><Button variant="primary">Open bookings</Button></Link>}
        >
          {(rows) => (
            <div className="dtable-wrap">
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
                  {rows.map((row) => {
                    const go = (): void => navigate(`/returns/new/${row.booking_id}`);
                    return (
                      <tr
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        onClick={go}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            go();
                          }
                        }}
                      >
                        <td>{row.customer_name}</td>
                        <td className="mono" style={{ fontSize: 13 }}>{formatDate(row.returned_at)}</td>
                        <td className="num">{formatGhs(row.total_charges_pesewas)}</td>
                        <td className="num">{formatGhs(row.refund_pesewas)}</td>
                        <td className="num">{formatGhs(row.balance_due_pesewas)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </AsyncList>
      </div>
    </div>
  );
}
