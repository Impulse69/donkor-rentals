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

  /*
   * Statutory or Simple — the same choice the New Invoice form offers, because
   * this sheet raises a real invoice underneath. Some rentals are priced with
   * NHIL/GETFund/VAT on top; the small cash ones are quoted flat. Only offered
   * while there is no invoice yet: an existing invoice has already fixed the
   * format and its total, and the server refuses a contradicting choice.
   *
   * Repricing goes through the server, not local arithmetic, so the figure on
   * this sheet is the figure the invoice and the ledger will carry.
   */
  const [statutory, setStatutory] = useState(true);
  const preview = useAsync(
    () => (open && owing === null ? api.invoices.previewForBooking(bookingId, statutory) : Promise.resolve(null)),
    [open, owing, bookingId, statutory],
  );

  const expected = owing ?? (preview.status === 'ok' ? preview.data?.total_pesewas ?? null : null);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(todayInput());
  const [saving, setSaving] = useState(false);

  // Seed the amount once the figure is known; re-seed when the sheet reopens or
  // the tax choice reprices the rental. Deliberately overwrites a hand-typed
  // amount on toggle: the old figure belongs to the other format, and carrying
  // it across is how someone charges a taxed total on an untaxed sale.
  useEffect(() => {
    if (open && expected !== null) setAmount(expected);
  }, [open, expected]);

  useEffect(() => {
    if (!open) {
      setReference('');
      setMethod('cash');
      setPaidOn(todayInput());
      setStatutory(true);
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
        // Only meaningful when the sheet is raising the invoice itself; when
        // one exists the server holds the sheet to that invoice's format.
        ...(owing === null ? { include_statutory_taxes: statutory } : {}),
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
      {owing === null && (
        <div style={{ marginBottom: 14 }}>
          <Select
            label="Taxes"
            value={statutory ? 'statutory' : 'simple'}
            onChange={(e) => setStatutory(e.target.value === 'statutory')}
            options={[
              { value: 'statutory', label: 'Statutory — adds NHIL, GETFund & VAT' },
              { value: 'simple', label: 'Simple — no taxes' },
            ]}
            hint={
              preview.status === 'ok' && preview.data
                ? statutory
                  ? `${formatGhs(preview.data.subtotal_pesewas)} + ${formatGhs(preview.data.nhil_pesewas + preview.data.getfund_pesewas + preview.data.vat_pesewas)} tax`
                  : `${formatGhs(preview.data.subtotal_pesewas)}, nothing added`
                : undefined
            }
          />
        </div>
      )}
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

    </Modal>
  );
}
