import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { dateInputToIso, todayInput } from '../../lib/dates';
import { formatGhs, formatPesewasPlain, parseCedisToPesewas } from '../../lib/format';
import { Button } from '../../components/Button';
import { Input, Select, Textarea } from '../../components/Field';
import { Alert } from '../../components/Alert';
import { EmptyState } from '../../components/EmptyState';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import type { DamageSeverity, ReturnCondition } from '@shared/schemas';

interface LineState {
  condition: ReturnCondition;
  severity: DamageSeverity | '';
  quantity: number;
  description: string;
  charge: string;
  writeOff: boolean;
}

export default function ReturnForm(): JSX.Element {
  const { bookingId = '' } = useParams();
  const booking = useAsync(() => api.bookings.get(bookingId), [bookingId]);
  const navigate = useNavigate();
  const toast = useToast();
  const [returnedAt, setReturnedAt] = useState(todayInput());
  const [receivedBy, setReceivedBy] = useState('');
  const [deposit, setDeposit] = useState('0.00');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const bookingData = booking.status === 'ok' ? booking.data : null;

  const initialLines = useMemo(() => {
    if (!bookingData) return [];
    return bookingData.lines.map((line) => [
      line.id,
      {
        condition: 'good' as ReturnCondition,
        severity: '',
        quantity: line.quantity,
        description: '',
        charge: '0.00',
        writeOff: false,
      } satisfies LineState,
    ] as const);
  }, [bookingData]);
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const mergedLines = useMemo(() => Object.fromEntries(initialLines.map(([id, state]) => [id, lines[id] ?? state])), [initialLines, lines]);

  if (booking.status === 'loading' || booking.status === 'idle') {
    return <div className="row" style={{ justifyContent: 'center', padding: 60 }}><Spinner /></div>;
  }
  if (booking.status === 'error') return <Alert tone="bad" eyebrow="Booking">{booking.error.message}</Alert>;
  if (!booking.data) {
    return <EmptyState title="Booking not found" actions={<Link to="/bookings"><Button>Back to bookings</Button></Link>} />;
  }

  const totalCharges = booking.data.lines.reduce((sum, line) => sum + parseCedisToPesewas(mergedLines[line.id]?.charge ?? '0'), 0);
  const depositPesewas = parseCedisToPesewas(deposit);
  const refund = Math.max(0, depositPesewas - totalCharges);
  const balance = Math.max(0, totalCharges - depositPesewas);

  function setLine(id: string, patch: Partial<LineState>): void {
    setLines((current) => ({ ...current, [id]: { ...mergedLines[id], ...patch } as LineState }));
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setSaving(true);
    try {
      await api.returns.create({
        booking_id: booking.data.id,
        returned_at: dateInputToIso(returnedAt, new Date().toTimeString().slice(0, 5)),
        received_by: receivedBy || null,
        notes: notes || null,
        deposit_pesewas: depositPesewas,
        lines: booking.data.lines.map((line) => {
          const state = mergedLines[line.id];
          return {
            booking_line_id: line.id,
            item_id: line.item_id,
            item_unit_id: line.item_unit_id,
            condition: state.condition,
            severity: state.severity || null,
            quantity: state.quantity,
            description: state.description || null,
            charge_pesewas: parseCedisToPesewas(state.charge),
            write_off: state.writeOff,
          };
        }),
      });
      toast.ok('Return recorded');
      navigate('/returns');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not record return');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="page fade-up" style={{ maxWidth: 1100 }} onSubmit={(e) => { void submit(e); }}>
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Operations · Return</div>
          <h1 className="page-title" style={{ fontStyle: 'normal' }}>{booking.data.customer_name}</h1>
          <p className="muted" style={{ marginTop: 8 }}>Inspect returned inventory and reconcile the deposit.</p>
        </div>
        <div className="page-actions">
          <Button variant="primary" type="submit" loading={saving}>Record return</Button>
        </div>
      </header>

      <section className="card card-warm">
        <div className="form-grid">
          <Input label="Returned date" type="date" value={returnedAt} onChange={(e) => setReturnedAt(e.target.value)} />
          <Input label="Received by" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} />
          <Input label="Deposit held" prefix="GHS" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
          <Input label="Damage charges" value={formatPesewasPlain(totalCharges)} readOnly />
          <Textarea containerClass="full" label="Return notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </section>

      <section className="card">
        <h3 className="card-title">Condition checklist</h3>
        <div className="stack">
          {booking.data.lines.map((line) => {
            const state = mergedLines[line.id];
            return (
              <div key={line.id} className="card card-warm">
                <div className="row-between" style={{ marginBottom: 12 }}>
                  <div>
                    <span className="mono muted" style={{ fontSize: 12 }}>{line.item_id.slice(0, 8)}</span>
                    <div>Qty booked: {line.quantity}</div>
                  </div>
                  <strong>{formatGhs(line.daily_rate_pesewas)} / day</strong>
                </div>
                <div className="form-grid">
                  <Select
                    label="Condition"
                    value={state.condition}
                    onChange={(e) => setLine(line.id, { condition: e.target.value as ReturnCondition })}
                    options={[
                      { value: 'good', label: 'Good' },
                      { value: 'damaged', label: 'Damaged' },
                      { value: 'lost', label: 'Lost' },
                    ]}
                  />
                  <Select
                    label="Severity"
                    value={state.severity}
                    onChange={(e) => setLine(line.id, { severity: e.target.value as DamageSeverity | '' })}
                    options={[
                      { value: '', label: 'None' },
                      { value: 'minor', label: 'Minor' },
                      { value: 'moderate', label: 'Moderate' },
                      { value: 'severe', label: 'Severe' },
                      { value: 'write_off', label: 'Write-off' },
                    ]}
                  />
                  <Input
                    label="Affected qty"
                    type="number"
                    min={1}
                    max={line.quantity}
                    value={String(state.quantity)}
                    onChange={(e) => setLine(line.id, { quantity: Number(e.target.value) })}
                  />
                  <Input
                    label="Charge"
                    prefix="GHS"
                    inputMode="decimal"
                    value={state.charge}
                    onChange={(e) => setLine(line.id, { charge: e.target.value })}
                  />
                  <Textarea
                    containerClass="full"
                    label="Damage description"
                    rows={2}
                    value={state.description}
                    onChange={(e) => setLine(line.id, { description: e.target.value })}
                  />
                  <label className="field full" style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={state.writeOff}
                      onChange={(e) => setLine(line.id, { writeOff: e.target.checked })}
                    />
                    <span>Flag as write-off</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid-3">
        <div className="card"><strong>Charges</strong><div>{formatGhs(totalCharges)}</div></div>
        <div className="card"><strong>Refund</strong><div>{formatGhs(refund)}</div></div>
        <div className="card"><strong>Balance due</strong><div>{formatGhs(balance)}</div></div>
      </section>
    </form>
  );
}
