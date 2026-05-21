import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { api } from '../../lib/api';
import { paths } from '../../router/paths';
import { formatGhs, parseCedisToPesewas, formatDate } from '../../lib/format';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { Alert } from '../../components/Alert';
import { Input, Textarea } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { Badge } from '../../components/Badge';
import { KV } from '../../components/KV';
import { dateInputToIso } from '../../lib/dates';

type TaxFormat = 'statutory' | 'simple';

/**
 * Pure copy of the cascading Ghana statutory tax formula from the main repo,
 * used here only to drive the live preview. The authoritative computation
 * happens server-side in `repositories/invoices.ts#computeStatutoryTaxes`.
 */
function previewStatutory(subtotal: number): { nhil: number; getfund: number; vat: number; total: number } {
  const sub = Math.max(0, Math.round(subtotal));
  const nhil = Math.round(sub * 0.025);
  const getfund = Math.round(sub * 0.025);
  const vat = Math.round((sub + nhil + getfund) * 0.15);
  return { nhil, getfund, vat, total: sub + nhil + getfund + vat };
}

export default function NewInvoice(): JSX.Element {
  const [params] = useSearchParams();
  const fromBookingId = params.get('from') ?? '';
  const navigate = useNavigate();
  const toast = useToast();

  const [bookingId, setBookingId] = useState<string>(fromBookingId);
  const bookings = useAsync(() => api.bookings.list({}), []);
  const booking = useAsync(
    () => (bookingId ? api.bookings.get(bookingId) : Promise.resolve(null)),
    [bookingId],
  );

  const existing = useAsync(
    () => (bookingId ? api.invoices.list({ bookingId }) : Promise.resolve([])),
    [bookingId],
  );

  const [taxFormat, setTaxFormat] = useState<TaxFormat>('statutory');
  const [discount, setDiscount] = useState('0.00');
  const [initialPct, setInitialPct] = useState<number>(50);
  const [beforeDeliveryPct, setBeforeDeliveryPct] = useState<number>(50);
  const [notes, setNotes] = useState('');
  const [dueAt, setDueAt] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const bookingDataId = booking.status === 'ok' ? booking.data?.id : null;
  const bookingData = booking.data;

  useEffect(() => {
    if (booking.status === 'ok' && bookingData) {
      const d = new Date(bookingData.ends_at);
      d.setDate(d.getDate() + 7);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      setDueAt(`${y}-${m}-${day}`);
    }
  }, [booking.status, bookingDataId, bookingData]);

  const preview = useMemo(() => {
    if (booking.status !== 'ok' || !booking.data) return null;
    const days = Math.max(
      1,
      Math.ceil(
        (new Date(booking.data.ends_at).getTime() - new Date(booking.data.starts_at).getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );
    const lines = booking.data.lines.map((l) => ({
      id: l.id,
      description: `Item ${l.item_id.slice(0, 8)}…`,
      quantity: l.quantity,
      days,
      unit_price_pesewas: l.daily_rate_pesewas,
      line_total_pesewas: l.daily_rate_pesewas * l.quantity * days,
    }));
    const subtotal = lines.reduce((acc, l) => acc + l.line_total_pesewas, 0);
    const discountN = parseCedisToPesewas(discount);
    const tax = previewStatutory(subtotal);
    const grossTotal = taxFormat === 'statutory' ? tax.total : subtotal;
    const total = Math.max(0, grossTotal - discountN);
    return { lines, days, subtotal, tax, discount: discountN, total };
  }, [booking, taxFormat, discount]);

  const items = useAsync(() => api.catalog.list({}), []);
  const itemName = (id: string): string => {
    if (items.status !== 'ok') return id.slice(0, 8);
    return items.data.find((i) => i.id === id)?.name ?? id.slice(0, 8);
  };

  const termsSum = initialPct + beforeDeliveryPct;
  const termsMismatch = termsSum !== 100;

  async function onGenerate(): Promise<void> {
    if (!bookingId) { toast.error('Pick a booking'); return; }
    setSaving(true);
    try {
      const invoice = await api.invoices.createFromBooking({
        booking_id: bookingId,
        include_statutory_taxes: taxFormat === 'statutory',
        initial_payment_percent: initialPct,
        before_delivery_percent: beforeDeliveryPct,
        discount_pesewas: parseCedisToPesewas(discount),
        notes: notes || null,
        due_at: dueAt ? dateInputToIso(dueAt, '17:00') : null,
      });
      toast.ok(`${invoice.number} drafted`);
      navigate(paths.invoices.detail(invoice.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page fade-up" style={{ maxWidth: 1100 }}>
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Operations · Receivables</div>
          <h1 className="page-title">Generate invoice</h1>
          <p className="muted" style={{ marginTop: 8, maxWidth: 600 }}>
            Pick a booking — its lines become the invoice lines, with days computed from the
            booking window. Choose a tax format and set payment terms.
          </p>
        </div>
      </header>

      <div className="grid-2 fade-up fade-up-1" style={{ gridTemplateColumns: '2fr 1fr', alignItems: 'flex-start' }}>
        <div className="card">
          <div className="form-grid">
            <div className="field full">
              <span className="field-label">Booking</span>
              <select
                className="select"
                value={bookingId}
                onChange={(e) => setBookingId(e.target.value)}
              >
                <option value="">— Pick a booking —</option>
                {bookings.status === 'ok' &&
                  bookings.data
                    .filter((b) => b.status !== 'cancelled')
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.customer_name} · {formatDate(b.starts_at)} → {formatDate(b.ends_at)}
                      </option>
                    ))}
              </select>
            </div>

            <div className="field full">
              <span className="field-label">Tax format</span>
              <div
                role="radiogroup"
                aria-label="Tax format"
                style={{
                  display: 'inline-flex',
                  border: '1px solid var(--rule)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: 'var(--panel)',
                }}
              >
                {(['statutory', 'simple'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={taxFormat === f}
                    onClick={() => setTaxFormat(f)}
                    style={{
                      padding: '8px 18px',
                      border: 'none',
                      cursor: 'pointer',
                      background: taxFormat === f ? 'var(--accent, #111)' : 'transparent',
                      color: taxFormat === f ? '#fff' : 'var(--ink, #111)',
                      fontWeight: 600,
                      fontSize: 13,
                      textTransform: 'capitalize',
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <span className="field-hint" style={{ display: 'block', marginTop: 6 }}>
                {taxFormat === 'statutory'
                  ? 'NHIL 2.5% + GETFund 2.5% + VAT 15% (cascading) added to subtotal.'
                  : 'Subtotal only — no statutory taxes added.'}
              </span>
            </div>

            <Input
              label="Initial payment %"
              type="number"
              min={0}
              max={100}
              value={String(initialPct)}
              onChange={(e) => setInitialPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
            />
            <Input
              label="Before delivery %"
              type="number"
              min={0}
              max={100}
              value={String(beforeDeliveryPct)}
              onChange={(e) => setBeforeDeliveryPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              hint={termsMismatch ? `Initial + Before Delivery = ${termsSum}% (not 100%)` : 'Initial + Before Delivery = 100%'}
            />

            <Input
              label="Discount"
              prefix="GH₵"
              mono
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
            <Input
              label="Due date"
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
            <Textarea
              containerClass="full"
              label="Notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional — appears on the invoice"
            />
          </div>

          <div className="form-actions">
            <Link to={paths.invoices.list}>
              <Button variant="ghost" type="button">Cancel</Button>
            </Link>
            <Button
              variant="primary"
              loading={saving}
              disabled={!bookingId}
              onClick={() => { void onGenerate(); }}
            >
              Generate draft
            </Button>
          </div>
        </div>

        <div className="stack">
          {existing.status === 'ok' && existing.data.length > 0 && (
            <Alert tone="warn" eyebrow="Heads up">
              This booking already has {existing.data.length} invoice{existing.data.length === 1 ? '' : 's'}.
              Issuing another will create a separate draft.
            </Alert>
          )}

          {booking.status === 'loading' && (
            <div className="card row" style={{ justifyContent: 'center' }}><Spinner /></div>
          )}
          {booking.status === 'ok' && booking.data && preview && (
            <div className="card">
              <span className="eyebrow">Preview</span>
              <h3 style={{ marginTop: 6 }}>{booking.data.customer_name}</h3>
              <div className="muted mono" style={{ fontSize: 12 }}>
                {formatDate(booking.data.starts_at)} → {formatDate(booking.data.ends_at)} · {preview.days} day{preview.days === 1 ? '' : 's'}
              </div>
              <div style={{ marginTop: 14 }}>
                {preview.lines.map((l) => (
                  <div key={l.id} className="row-between" style={{ padding: '6px 0', borderTop: '1px solid var(--rule-soft)' }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{itemName(booking.data!.lines.find((bl) => bl.id === l.id)?.item_id ?? '')}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {l.quantity} × {formatGhs(l.unit_price_pesewas)} × {l.days} day{l.days === 1 ? '' : 's'}
                      </div>
                    </div>
                    <span className="mono">{formatGhs(l.line_total_pesewas)}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--rule)' }}>
                <KV label="Subtotal" value={formatGhs(preview.subtotal)} />
                {taxFormat === 'statutory' && (
                  <>
                    <KV label="NHIL (2.5%)" value={formatGhs(preview.tax.nhil)} />
                    <KV label="GETFund (2.5%)" value={formatGhs(preview.tax.getfund)} />
                    <KV label="VAT (15%)" value={formatGhs(preview.tax.vat)} />
                  </>
                )}
                {preview.discount > 0 && <KV label="Discount" value={`− ${formatGhs(preview.discount)}`} />}
                <KV label="Total Amount" value={formatGhs(preview.total)} bold />
              </div>
            </div>
          )}
          {booking.status === 'ok' && !booking.data && bookingId && (
            <Alert tone="bad" eyebrow="Not found">Booking not found.</Alert>
          )}
          {!bookingId && (
            <div className="card card-warm">
              <span className="eyebrow">Tip</span>
              <p className="muted" style={{ marginTop: 6 }}>
                You can also click <Badge tone="gold">Generate invoice</Badge> on a booking detail
                page to land here pre-filled.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
