import {
  BOOKING_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  type BookingStatus,
  type InvoiceStatus,
} from '@shared/schemas';

export type StatusPillStatus = InvoiceStatus | BookingStatus | 'overdue';

interface StatusPillProps {
  status: StatusPillStatus;
}

const STATUS_LABELS: Record<StatusPillStatus, string> = {
  ...INVOICE_STATUS_LABELS,
  ...BOOKING_STATUS_LABELS,
  overdue: 'Overdue',
};

const STATUS_TONES: Record<StatusPillStatus, 'ok' | 'bad' | 'open' | 'neutral' | 'void'> = {
  draft: 'neutral',
  issued: 'open',
  paid: 'ok',
  void: 'void',
  quote: 'neutral',
  reserved: 'open',
  out: 'open',
  returned: 'ok',
  cancelled: 'bad',
  overdue: 'bad',
};

export function StatusPill({ status }: StatusPillProps): JSX.Element {
  return (
    <span className={`status-pill status-pill-${STATUS_TONES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
