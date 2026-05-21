import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { api } from '../../lib/api';
import { formatDateTime, relTime } from '../../lib/format';
import { paths } from '../../router/paths';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { AsyncList } from '../../components/AsyncList';
import { BOOKING_STATUS_LABELS, type BookingStatus } from '@shared/schemas';
import { bookingStatusTone, daysCovered } from './helpers';

const STATUS_OPTIONS: ReadonlyArray<{ value: BookingStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'quote', label: 'Quotes' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'out', label: 'Checked out' },
  { value: 'returned', label: 'Returned' },
  { value: 'cancelled', label: 'Cancelled' },
];

interface Row {
  id: string;
  status: BookingStatus;
  customer_name: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  driver_name: string | null;
  updated_at: string;
}

export default function BookingsList(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const status = (searchParams.get('status') ?? 'all') as BookingStatus | 'all';

  const list = useAsync(
    () => api.bookings.list({ ...(status !== 'all' ? { status: status as BookingStatus } : {}) }),
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
          <div className="page-eyebrow">Operations · Calendar</div>
          <h1 className="page-title">Bookings</h1>
          <p className="muted" style={{ marginTop: 8, maxWidth: 540, lineHeight: 1.55 }}>
            Quotes, reservations, and the trips on the road. Switch to the calendar for an
            at-a-glance week or month.
          </p>
        </div>
        <div className="page-actions">
          <Link to={paths.bookings.calendar}><Button>Calendar view</Button></Link>
          <Link to={paths.bookings.new}><Button variant="primary">+ New booking</Button></Link>
        </div>
      </header>

      <div className="page-toolbar fade-up fade-up-1">
        <select
          className="select"
          style={{ width: 200 }}
          value={status}
          onChange={(e) => setParam('status', e.target.value)}
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {status !== 'all' && (
          <Button variant="ghost" type="button" onClick={() => setSearchParams({}, { replace: true })}>
            Clear filter
          </Button>
        )}
      </div>

      <div className="fade-up fade-up-2">
        <AsyncList
          state={list}
          emptyTitle="No bookings yet"
          emptyBody={status === 'all'
            ? 'Write the first quote, reservation, or rental.'
            : 'Nothing matches that status. Try a different filter or create a new booking.'}
          emptyAction={<Link to={paths.bookings.new}><Button variant="primary">New booking</Button></Link>}
        >
          {(rows) => (
            <BookingsTable rows={rows as Row[]} onRowClick={(b) => navigate(paths.bookings.detail(b.id))} />
          )}
        </AsyncList>
      </div>
    </div>
  );
}

function BookingsTable({ rows, onRowClick }: { rows: Row[]; onRowClick: (b: Row) => void }): JSX.Element {
  return (
    <div className="dtable-wrap">
      <table className="dtable">
        <thead>
          <tr>
            <th style={{ width: 120 }}>Status</th>
            <th>Customer</th>
            <th>Window</th>
            <th className="num">Days</th>
            <th>Driver</th>
            <th>Modified</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr
              key={b.id}
              tabIndex={0}
              onClick={() => onRowClick(b)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onRowClick(b);
                }
              }}
            >
              <td><Badge tone={bookingStatusTone(b.status)}>{BOOKING_STATUS_LABELS[b.status]}</Badge></td>
              <td>
                <div style={{ fontWeight: 500 }}>{b.customer_name}</div>
                {b.notes && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{truncate(b.notes, 70)}</div>}
              </td>
              <td>
                <div className="mono" style={{ fontSize: 12 }}>
                  {formatDateTime(b.starts_at)}
                  <span className="faint" aria-hidden> → </span>
                  {formatDateTime(b.ends_at)}
                </div>
              </td>
              <td className="num">{daysCovered(b.starts_at, b.ends_at)}</td>
              <td>{b.driver_name || <span className="faint">—</span>}</td>
              <td>
                <span className="muted" style={{ fontSize: 12 }}>{relTime(b.updated_at)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
