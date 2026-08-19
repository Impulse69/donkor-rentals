import { useEffect, useState } from 'react';
import { PAYMENT_METHOD_OPTIONS, type PaymentMethod } from '@shared/schemas';
import { api } from '../lib/api';
import { dateInputToIso, todayInput } from '../lib/dates';
import { formatGhs } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { useToast } from './Toast';
import { Button } from './Button';
import { Input, Select } from './Field';
import { Modal } from './Modal';
import { MoneyInput } from './NumericInput';

interface Props {
  open: boolean;
  bookingId: string;
  /**
   * What the booking already owes if an invoice exists. When null the sheet
   * asks the server to price the booking as an invoice would — the same
   * function that will later write it, so the figure shown is the figure
   * charged.
   */
  owing: number | null;
  onClose: () => void;
  /** Called with the settled invoice id, so the caller can offer the receipt. */
  onTaken: (invoiceId: string, paymentId: string) => void;
}

/**
 * Take the money at the counter.
 *
 * The walk-in version of payment: no invoice screen, no terms, no deposits.
 * Amount defaults to everything owed, method defaults to cash, and one press
 * records the sale, the cash and a settled invoice together — then hands the
 * caller the ids it needs to print the receipt. What QuickBooks calls a Sales
 * Receipt.
 *
 * The invoice still exists underneath; it has to, because it is what posts the
 * sale to income. The person at the counter just never has to look at it.
 */
export function TakePaymentSheet({ open, bookingId, owing, onClose, onTaken }: Props): JSX.Element {
  const toast = useToast();
  const preview = useAsync(
    () => (open && owing === null ? api.invoices.previewForBooking(bookingId) : Promise.resolve(null)),
    [open, owing, bookingId],
  );

  const expected = owing ?? (preview.status === 'ok' ? preview.data?.total_pesewas ?? null : null);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(todayInput());
  const [saving, setSaving] = useState(false);

  // Seed the amount once the figure is known; re-seed if the sheet reopens.
  useEffect(() => {
    if (open && expected !== null) setAmount(expected);
  }, [open, expected]);

  useEffect(() => {
    if (!open) {
      setReference('');
      setMethod('cash');
      setPaidOn(todayInput());
    }
  }, [open]);

  async function submit(): Promise<void> {
    if (amount <= 0) { toast.error('Enter the amount received'); return; }
    setSaving(true);
    try {
      const result = await api.invoices.takePayment({
        booking_id: bookingId,
        amount_pesewas: amount,
        method,
        paid_at: dateInputToIso(paidOn, new Date().toTimeString().slice(0, 5)),
        reference: reference.trim() || null,
        notes: null,
      });
      const left = result.invoice.balance_due_pesewas;
      toast.ok(left > 0 ? `Payment taken — ${formatGhs(left)} still owing` : 'Paid in full');
      onTaken(result.invoice.id, result.payment.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not take payment');
    } finally {
      setSaving(false);
    }
  }

  const partial = expected !== null && amount > 0 && amount < expected;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Take payment"
      description={
        expected === null
          ? 'Working out the total…'
          : `${formatGhs(expected)} ${owing === null ? 'for this rental' : 'still owing'}`
      }
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Not now</Button>
          <Button
            type="button"
            variant="primary"
            loading={saving}
            disabled={expected === null || amount <= 0}
            onClick={() => { void submit(); }}
          >
            {partial ? `Take ${formatGhs(amount)}` : 'Take payment'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <MoneyInput
          label="Amount received"
          value={amount}
          onValueChange={setAmount}
          {...(partial ? { hint: `Leaves ${formatGhs((expected ?? 0) - amount)} owing` } : {})}
          autoFocus
        />
        <Select
          label="Method"
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          options={[...PAYMENT_METHOD_OPTIONS]}
        />
        <Input
          label="Reference (optional)"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          hint="MoMo transaction ID, cheque number, and so on"
        />
        <Input
          label="Date"
          type="date"
          value={paidOn}
          onChange={(e) => setPaidOn(e.target.value)}
        />
      </div>
      {preview.status === 'ok' && preview.data?.include_statutory_taxes && owing === null && (
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          Includes NHIL, GETFund and VAT. To invoice without them, use Create invoice instead.
        </p>
      )}
    </Modal>
  );
}
