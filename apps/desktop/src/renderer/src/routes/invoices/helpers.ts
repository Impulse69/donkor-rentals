import type { InvoiceStatus, PaymentKind } from '@shared/schemas';
import type { BadgeTone } from '../../components/Badge';

export function invoiceStatusTone(s: InvoiceStatus): BadgeTone {
  switch (s) {
    case 'draft': return 'neutral';
    case 'issued': return 'gold';
    case 'paid': return 'ok';
    case 'void': return 'bad';
  }
}

export function paymentKindTone(k: PaymentKind): BadgeTone {
  switch (k) {
    case 'deposit': return 'info';
    case 'payment': return 'ok';
    case 'refund': return 'warn';
  }
}
