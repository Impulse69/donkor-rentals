import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { api } from '../../lib/api';
import { formatDate, formatGhs } from '../../lib/format';
import { paths } from '../../router/paths';
import { Button, SplitButton } from '../../components/Button';
import { Dropdown } from '../../components/Dropdown';
import { AsyncList } from '../../components/AsyncList';
import { StatusPill } from '../../components/StatusPill';
import { type BookingStatus } from '@shared/schemas';

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
  customer_name?: string | null;
  renter_name?: string | null;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  total_pesewas?: number | null;
  lines?: Array<unknown>;
}

function customerLabel(row: { customer_name?: string | null; renter_name?: string | null }): string {
  return row.customer_name?.trim() || row.renter_name?.trim() || 'Walk-in rental';
}

function itemsLabel(row: Row): string {
  if (!row.lines) return '--';
  return `${row.lines.length} item${row.lines.length === 1 ? '' : 's'}`;
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
          <div className="page-eyebrow">Operations / Calendar</div>
          <h1 className="page-title">Bookings</h1>
          <p className="muted" style={{ marginTop: 8, maxWidth: 540, lineHeight: 1.55 }}>
            Quotes, reservations, and the trips on the road. Switch to the calendar for an
            at-a-glance week or month.
          </p>
        </div>
        <div className="page-actions">
          <Link to={paths.bookings.calendar}><Button>Calendar view</Button></Link>
          <Link to={paths.bookings.new}><Button variant="primary">New booking</Button></Link>
        </div>
      </header>

      <div className="dtable-toolbar fade-up fade-up-1">
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
            <BookingsTable
              rows={rows as Row[]}
              onView={(b) => navigate(paths.bookings.detail(b.id))}
              onNavigate={navigate}
            />
          )}
        </AsyncList>
      </div>
    </div>
  );
}

function BookingsTable({
  rows,
  onView,
  onNavigate,
}: {
  rows: Row[];
  onView: (b: Row) => void;
  onNavigate: (path: string) => void;
}): JSX.Element {
  const hasItems = rows.some((b) => Array.isArray(b.lines));
  const hasTotals = rows.some((b) => typeof b.total_pesewas === 'number');

  return (
    <div className="dtable-wrap">
      <table className="dtable">
        <thead>
          <tr>
            <th style={{ width: 150 }}>Booking no./ref</th>
            <th>Customer</th>
            <th style={{ width: 220 }}>Period</th>
            {hasItems && <th style={{ width: 110 }}>Items</th>}
            {hasTotals && <th className="num" style={{ width: 130 }}>Total</th>}
            <th style={{ width: 120 }}>Status</th>
            <th style={{ width: 190 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr
              key={b.id}
              tabIndex={0}
              onClick={() => onView(b)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onView(b);
                }
              }}
            >
              <td className="mono">{b.id.slice(0, 8)}</td>
              <td>
                <div style={{ fontWeight: 500 }}>{customerLabel(b)}</div>
                {b.notes && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{truncate(b.notes, 70)}</div>}
              </td>
              <td>
                <div className="mono" style={{ fontSize: 12 }}>
                  {formatDate(b.starts_at)}
                  <span className="faint" aria-hidden> - </span>
                  {formatDate(b.ends_at)}
                </div>
              </td>
              {hasItems && <td>{itemsLabel(b)}</td>}
              {hasTotals && (
                <td className="num">
                  {typeof b.total_pesewas === 'number' ? formatGhs(b.total_pesewas) : <span className="faint">--</span>}
                </td>
              )}
              <td><StatusPill status={b.status} /></td>
              <td onClick={(e) => e.stopPropagation()}>
                <SplitButton
                  size="sm"
                  onClick={() => onView(b)}
                  menu={
                    <>
                      <Dropdown.Item onSelect={() => onView(b)}>View</Dropdown.Item>
                      <Dropdown.Item onSelect={() => onNavigate(paths.bookings.edit(b.id))}>Edit</Dropdown.Item>
                      {b.status !== 'cancelled' && (
                        <Dropdown.Item onSelect={() => onNavigate(paths.invoices.fromBooking(b.id))}>
                          Create invoice
                        </Dropdown.Item>
                      )}
                      {b.status === 'out' && (
                        <Dropdown.Item onSelect={() => onNavigate(`/returns/new/${b.id}`)}>
                          Record return
                        </Dropdown.Item>
                      )}
                    </>
                  }
                >
                  View
                </SplitButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}...` : s;
}
