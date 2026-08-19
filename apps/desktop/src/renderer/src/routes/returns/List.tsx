import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { formatDate, formatGhs } from '../../lib/format';
import { AsyncList } from '../../components/AsyncList';
import { Button, SplitButton } from '../../components/Button';
import { Dropdown } from '../../components/Dropdown';

interface ReturnRow {
  id: string;
  booking_id: string;
  customer_name?: string | null;
  renter_name?: string | null;
  returned_at: string;
  deposit_pesewas: number;
  total_charges_pesewas: number;
  refund_pesewas: number;
  balance_due_pesewas: number;
}

function customerLabel(row: { customer_name?: string | null; renter_name?: string | null }): string {
  return row.customer_name?.trim() || row.renter_name?.trim() || 'Walk-in rental';
}

export default function ReturnsList(): JSX.Element {
  const navigate = useNavigate();
  const returns = useAsync(() => api.returns.list(), []);

  return (
    <div className="page fade-up">
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Operations / Returns</div>
          <h1 className="page-title">Damage and deposits</h1>
          <p className="muted" style={{ maxWidth: 620, marginTop: 8, lineHeight: 1.55 }}>
            Completed return inspections, deposit deductions, refunds, and outstanding damage balances.
          </p>
        </div>
      </header>

      <div className="dtable-toolbar fade-up fade-up-1">
        <span className="muted" style={{ fontSize: 13 }}>Return records</span>
        <div className="dtable-toolbar-actions">
          <Link to="/bookings"><Button>Open bookings</Button></Link>
        </div>
      </div>

      <div className="fade-up fade-up-2">
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
                    <th style={{ width: 130 }}>Return date</th>
                    <th style={{ width: 140 }}>Booking</th>
                    <th>Customer</th>
                    <th className="num" style={{ width: 130 }}>Deposit held</th>
                    <th className="num" style={{ width: 120 }}>Charges</th>
                    <th className="num" style={{ width: 120 }}>Refund due</th>
                    <th className="num" style={{ width: 120 }}>Balance</th>
                    <th style={{ width: 190 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows as ReturnRow[]).map((row) => {
                    // Every row here IS a recorded return, and the return form
                    // refuses a booking that has already been returned — so this
                    // used to land on "Return already recorded" every single
                    // time, with no way through. The booking is where the
                    // charges, deposit and refund actually live.
                    const go = (): void => navigate(`/bookings/${row.booking_id}`);
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
                        <td className="mono" style={{ fontSize: 13 }}>{formatDate(row.returned_at)}</td>
                        <td className="mono">{row.booking_id.slice(0, 8)}</td>
                        <td>{customerLabel(row)}</td>
                        <td className="num">{formatGhs(row.deposit_pesewas)}</td>
                        <td className="num">{formatGhs(row.total_charges_pesewas)}</td>
                        <td className="num">{formatGhs(row.refund_pesewas)}</td>
                        <td className="num">{formatGhs(row.balance_due_pesewas)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <SplitButton
                            size="sm"
                            onClick={go}
                            menu={
                              <>
                                <Dropdown.Item onSelect={go}>View booking</Dropdown.Item>
                              </>
                            }
                          >
                            View booking
                          </SplitButton>
                        </td>
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
