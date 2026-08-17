import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { api } from '../../lib/api';
import { paths } from '../../router/paths';
import { formatDate, formatGhs } from '../../lib/format';
import { printHtml } from '../../lib/print';
import { Button } from '../../components/Button';
import { StatusPill } from '../../components/StatusPill';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { Alert } from '../../components/Alert';
import { AuditCard } from '../../components/AuditCard';
import { ConfirmModal } from '../../components/Modal';
import { KV } from '../../components/KV';
import { useToast } from '../../components/Toast';
import {
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_TRANSITIONS,
  type BookingStatus,
} from '@shared/schemas';
import { daysCovered } from './helpers';

function customerLabel(row: { customer_name?: string | null; renter_name?: string | null }): string {
  return row.customer_name?.trim() || row.renter_name?.trim() || 'Walk-in rental';
}

export default function BookingDetail(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const booking = useAsync(() => api.bookings.get(id), [id]);
  const invoices = useAsync(() => api.invoices.list({ bookingId: id }), [id]);
  const firstInvoiceId = invoices.data?.[0]?.id;
  const invoiceDetail = useAsync(
    () => (firstInvoiceId ? api.invoices.get(firstInvoiceId) : Promise.resolve(null)),
    [firstInvoiceId],
  );
  const [busy, setBusy] = useState(false);
  const [docBusy, setDocBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pendingCancel, setPendingCancel] = useState<BookingStatus | null>(null);

  if (booking.status === 'idle' || booking.status === 'loading') {
    return (
      <div className="row" style={{ justifyContent: 'center', padding: 60, color: 'var(--ink-mute)' }}>
        <Spinner /> <span style={{ marginLeft: 10 }}>Loading booking...</span>
      </div>
    );
  }
  if (booking.status === 'error') {
    return <Alert tone="bad" eyebrow="Error" title="Could not load this booking">{booking.error.message}</Alert>;
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
  const billTo = customerLabel(b);
  const days = daysCovered(b.starts_at, b.ends_at);
  const subtotal = b.lines.reduce((sum, l) => sum + l.daily_rate_pesewas * l.quantity * days, 0);
  const transitions = BOOKING_STATUS_TRANSITIONS[b.status];
  const hasInvoice = Boolean(invoices.data && invoices.data.length > 0);
  const latestPayment = invoiceDetail.data?.payments?.[invoiceDetail.data.payments.length - 1];

  async function transition(next: BookingStatus): Promise<void> {
    setBusy(true);
    try {
      await api.bookings.transition(b.id, next);
      toast.ok(`Marked ${BOOKING_STATUS_LABELS[next].toLowerCase()}`);
      booking.refresh();
      invoices.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not transition');
    } finally {
      setBusy(false);
    }
  }

  async function runRemove(): Promise<void> {
    try {
      await api.bookings.softDelete(b.id);
      toast.ok('Booking removed');
      setConfirmRemove(false);
      navigate(paths.bookings.list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove');
    }
  }

  async function printContract(): Promise<void> {
    setDocBusy(true);
    try {
      const doc = await api.documents.contract(b.id);
      printHtml(doc.html);
      toast.ok(`${doc.title} sent to printer`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate contract');
    } finally {
      setDocBusy(false);
    }
  }

  async function printTripSheet(): Promise<void> {
    setDocBusy(true);
    try {
      const doc = await api.documents.tripSheet(b.id);
      printHtml(doc.html);
      toast.ok(`${doc.title} sent to printer`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate trip sheet');
    } finally {
      setDocBusy(false);
    }
  }

  async function printReceipt(paymentId: string): Promise<void> {
    setDocBusy(true);
    try {
      const doc = await api.documents.receipt(paymentId);
      printHtml(doc.html);
      toast.ok(`${doc.title} sent to printer`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate receipt');
    } finally {
      setDocBusy(false);
    }
  }

  function clickTransition(next: BookingStatus): void {
    if (next === 'cancelled') {
      setPendingCancel(next);
      setConfirmCancel(true);
      return;
    }
    void transition(next);
  }

  return (
    <div className="page invoice-page booking-detail-page fade-up" style={{ maxWidth: 1180 }}>
      <header className="invoice-hero">
        <div className="invoice-hero-main">
          <div className="page-eyebrow">Operations / Booking</div>
          <div className="invoice-title-row">
            <h1 className="page-title invoice-title">{b.id.slice(0, 8)}</h1>
            <StatusPill status={b.status} />
          </div>
          <div className="invoice-subline">
            <span>{billTo}</span>
            <span className="mono">{days} day{days === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div className="invoice-balance-box">
          <span>{formatDate(b.starts_at)} - {formatDate(b.ends_at)}</span>
          <strong>{formatGhs(subtotal)}</strong>
        </div>
      </header>

      <section className="invoice-meta-band fade-up fade-up-1">
        <div>
          <span className="invoice-meta-label">Customer</span>
          <strong>{billTo}</strong>
          {b.customer_id ? (
            <Link to={paths.customers.detail(b.customer_id)}>Open customer file</Link>
          ) : (
            <span className="muted" style={{ fontSize: 13 }}>Walk-in rental</span>
          )}
        </div>
        <div className="invoice-meta-dates">
          <KV label="Pickup" value={b.pickup_location || '--'} />
          <KV label="Drop-off" value={b.dropoff_location || '--'} />
          <KV label="Driver" value={b.driver_name || '--'} />
        </div>
      </section>

      <div className="invoice-sheet fade-up fade-up-2">
        <section>
          <div className="dtable-wrap invoice-lines">
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
                  <tr key={l.id} style={{ cursor: 'default' }}>
                    <td>
                      <Link to={paths.catalog.detail(l.item_id)} style={{ color: 'inherit' }}>
                        <span className="mono muted" style={{ fontSize: 12 }}>{l.item_id.slice(0, 8)}</span>
                      </Link>
                      <HearseFields line={l} />
                    </td>
                    <td className="num">{l.quantity}</td>
                    <td className="num">{formatGhs(l.daily_rate_pesewas)}</td>
                    <td className="num">{days}</td>
                    <td className="num strong">{formatGhs(l.daily_rate_pesewas * l.quantity * days)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="invoice-summary-row">
            <div>
              {b.notes && (
                <div className="detail-row invoice-notes">
                  <span className="detail-key">Notes</span>
                  <span className="detail-val" style={{ whiteSpace: 'pre-wrap' }}>{b.notes}</span>
                </div>
              )}
            </div>
            <table className="invoice-totals">
              <tbody>
                <tr><td>Rental days</td><td className="num">{days}</td></tr>
                <tr className="is-balance"><td>Total</td><td className="num">{formatGhs(subtotal)}</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="invoice-support">
          <div className="card card-warm">
            <span className="eyebrow">Booking</span>
            <h3>{billTo}</h3>
            <KV label="Rental window" value={`${formatDate(b.starts_at)} to ${formatDate(b.ends_at)}`} />
            <KV label="Status" value={BOOKING_STATUS_LABELS[b.status]} />
            {hasInvoice && invoices.data?.[0] && (
              <Link to={paths.invoices.detail(invoices.data[0].id)}>Open invoice</Link>
            )}
          </div>
          <AuditCard createdAt={b.created_at} updatedAt={b.updated_at} id={b.id} />
        </section>
      </div>

      <div className="invoice-actionbar" role="toolbar" aria-label="Booking actions">
        <div className="invoice-actionbar-left">
          <Link to={paths.bookings.list}>
            <Button variant="ghost">Back</Button>
          </Link>
          <Button variant="danger" onClick={() => setConfirmRemove(true)}>Remove</Button>
        </div>
        <div className="invoice-actionbar-right">
          {transitions.map((t) => (
            <Button
              key={t}
              variant={t === 'cancelled' ? 'danger' : 'primary'}
              loading={busy}
              onClick={() => clickTransition(t)}
            >
              {labelForTransition(b.status, t)}
            </Button>
          ))}
          {b.status === 'out' && (
            <Link to={`/returns/new/${b.id}`}><Button>Record return</Button></Link>
          )}
          {hasInvoice && invoices.data?.[0] ? (
            <Link to={paths.invoices.detail(invoices.data[0].id)}>
              <Button>View invoice</Button>
            </Link>
          ) : (
            <Link to={paths.invoices.fromBooking(b.id)}>
              <Button>Generate invoice</Button>
            </Link>
          )}
          {latestPayment && (
            <Button loading={docBusy} onClick={() => { void printReceipt(latestPayment.id); }}>
              Print receipt
            </Button>
          )}
          <Button loading={docBusy} onClick={() => { void printTripSheet(); }}>
            Print trip sheet
          </Button>
          <Button loading={docBusy} onClick={() => { void printContract(); }}>
            Print contract
          </Button>
          <Link to={paths.bookings.edit(b.id)}><Button>Edit</Button></Link>
        </div>
      </div>

      <ConfirmModal
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={runRemove}
        title="Remove this booking?"
        body="Past records stay on file - this hides the booking from active lists."
        confirmLabel="Remove booking"
        tone="danger"
      />

      <ConfirmModal
        open={confirmCancel}
        onClose={() => { setConfirmCancel(false); setPendingCancel(null); }}
        onConfirm={async () => {
          if (pendingCancel) await transition(pendingCancel);
          setConfirmCancel(false);
          setPendingCancel(null);
        }}
        title="Cancel booking?"
        body={`Mark "${billTo}" as cancelled. The record stays on file for audit; inventory frees up immediately.`}
        confirmLabel="Cancel booking"
        cancelLabel="Keep booking"
        tone="warn"
        loading={busy}
      />
    </div>
  );
}

function HearseFields({
  line,
}: {
  line: {
    odometer_start_km?: number | null;
    odometer_end_km?: number | null;
    fuel_litres_start?: number | null;
    fuel_litres_end?: number | null;
  };
}): JSX.Element | null {
  const values = [
    line.odometer_start_km != null ? `Odo start ${line.odometer_start_km} km` : null,
    line.odometer_end_km != null ? `Odo end ${line.odometer_end_km} km` : null,
    line.fuel_litres_start != null ? `Fuel start ${line.fuel_litres_start} L` : null,
    line.fuel_litres_end != null ? `Fuel end ${line.fuel_litres_end} L` : null,
  ].filter(Boolean);

  if (values.length === 0) return null;
  return <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{values.join(' / ')}</div>;
}

function labelForTransition(from: BookingStatus, to: BookingStatus): string {
  if (from === 'quote' && to === 'reserved') return 'Confirm reservation';
  if (from === 'reserved' && to === 'out') return 'Check out';
  if (from === 'out' && to === 'returned') return 'Mark returned';
  if (to === 'cancelled') return 'Cancel booking';
  return BOOKING_STATUS_LABELS[to];
}
