import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { api } from '../../lib/api';
import { paths } from '../../router/paths';
import { formatDate, formatGhs } from '../../lib/format';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { Alert } from '../../components/Alert';
import { AuditCard } from '../../components/AuditCard';
import { useToast } from '../../components/Toast';
import {
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_TRANSITIONS,
  type BookingStatus,
} from '@shared/schemas';
import { bookingStatusTone, daysCovered } from './helpers';

export default function BookingDetail(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const booking = useAsync(() => api.bookings.get(id), [id]);
  const [busy, setBusy] = useState(false);

  if (booking.status === 'idle' || booking.status === 'loading') {
    return <div className="row" style={{ justifyContent: 'center', padding: 60 }}><Spinner /></div>;
  }
  if (booking.status === 'error') {
    return <Alert tone="bad" eyebrow="Error">{booking.error.message}</Alert>;
  }
  if (!booking.data) {
    return (
      <div className="page">
        <EmptyState
          title="Booking not found"
          body="It may have been cancelled and removed."
          actions={<Link to={paths.bookings.list}><Button variant="primary">Back to bookings</Button></Link>}
        />
      </div>
    );
  }

  const b = booking.data;
  const days = daysCovered(b.starts_at, b.ends_at);
  const subtotal = b.lines.reduce((sum, l) => sum + l.daily_rate_pesewas * l.quantity * days, 0);
  const transitions = BOOKING_STATUS_TRANSITIONS[b.status];

  async function transition(next: BookingStatus): Promise<void> {
    setBusy(true);
    try {
      await api.bookings.transition(b.id, next);
      toast.ok(`Marked ${BOOKING_STATUS_LABELS[next].toLowerCase()}`);
      booking.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not transition');
    } finally {
      setBusy(false);
    }
  }

  async function onCancelDelete(): Promise<void> {
    if (!confirm('Remove this booking from the list? Past records stay on file.')) return;
    try {
      await api.bookings.softDelete(b.id);
      toast.ok('Booking removed');
      navigate(paths.bookings.list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove');
    }
  }

  return (
    <div className="page fade-up" style={{ maxWidth: 1100 }}>
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Operations · Booking</div>
          <h1 className="page-title" style={{ fontStyle: 'normal' }}>{b.customer_name}</h1>
          <div className="row" style={{ marginTop: 10, gap: 10 }}>
            <Badge tone={bookingStatusTone(b.status)} dot>{BOOKING_STATUS_LABELS[b.status]}</Badge>
            <span className="muted mono" style={{ fontSize: 13 }}>
              {formatDate(b.starts_at)} → {formatDate(b.ends_at)} · {days} day{days === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <div className="page-actions">
          {transitions.map((t) => (
            <Button
              key={t}
              variant={t === 'cancelled' ? 'danger' : 'primary'}
              loading={busy}
              onClick={() => { void transition(t); }}
            >
              {labelForTransition(b.status, t)}
            </Button>
          ))}
          <Link to={paths.invoices.fromBooking(b.id)}><Button>Generate invoice</Button></Link>
          <Link to={paths.bookings.edit(b.id)}><Button>Edit</Button></Link>
          <Button variant="danger" onClick={() => { void onCancelDelete(); }}>Remove</Button>
        </div>
      </header>

      <div className="detail-grid fade-up fade-up-1">
        <div className="card">
          <h3 className="card-title">Lines</h3>
          <div className="dtable-wrap" style={{ marginTop: 8 }}>
            <table className="dtable">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Qty</th>
                  <th className="num">Rate / day</th>
                  <th className="num">Days</th>
                  <th className="num">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {b.lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link to={paths.catalog.detail(l.item_id)} style={{ color: 'inherit' }}>
                        <span className="mono muted" style={{ fontSize: 12 }}>{l.item_id.slice(0, 8)}</span>
                      </Link>
                    </td>
                    <td className="num">{l.quantity}</td>
                    <td className="num">{formatGhs(l.daily_rate_pesewas)}</td>
                    <td className="num">{days}</td>
                    <td className="num">{formatGhs(l.daily_rate_pesewas * l.quantity * days)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ textAlign: 'right', padding: '14px', borderTop: '1px solid var(--rule)' }}>
                    <span className="muted">Subtotal</span>
                  </td>
                  <td className="num" style={{ borderTop: '1px solid var(--rule)', fontSize: 16 }}>
                    {formatGhs(subtotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <h3 className="card-title" style={{ marginTop: 'var(--s-6)' }}>Trip details</h3>
          <div className="detail-row">
            <span className="detail-key">Pickup</span>
            <span className="detail-val">{b.pickup_location || <span className="faint">—</span>}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Drop-off</span>
            <span className="detail-val">{b.dropoff_location || <span className="faint">—</span>}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Driver</span>
            <span className="detail-val">{b.driver_name || <span className="faint">—</span>}</span>
          </div>
          {b.notes && (
            <div className="detail-row">
              <span className="detail-key">Notes</span>
              <span className="detail-val" style={{ whiteSpace: 'pre-wrap' }}>{b.notes}</span>
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card card-warm">
            <span className="eyebrow">Customer</span>
            <h3 style={{ marginTop: 6 }}>{b.customer_name}</h3>
            <Link to={paths.customers.detail(b.customer_id)} style={{ fontSize: 13 }}>
              Open customer file →
            </Link>
          </div>
          <AuditCard createdAt={b.created_at} updatedAt={b.updated_at} id={b.id} />
        </div>
      </div>
    </div>
  );
}

function labelForTransition(from: BookingStatus, to: BookingStatus): string {
  if (from === 'quote' && to === 'reserved') return 'Confirm reservation';
  if (from === 'reserved' && to === 'out') return 'Check out';
  if (from === 'out' && to === 'returned') return 'Mark returned';
  if (to === 'cancelled') return 'Cancel booking';
  return BOOKING_STATUS_LABELS[to];
}
