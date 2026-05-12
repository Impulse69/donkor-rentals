import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { api } from '../../lib/api';
import { paths } from '../../router/paths';
import {
  formatGhs,
  formatPesewasPlain,
  parseCedisToPesewas,
  formatDate,
  formatDateTime,
} from '../../lib/format';
import { printHtml } from '../../lib/print';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { Alert } from '../../components/Alert';
import { AuditCard } from '../../components/AuditCard';
import { KV } from '../../components/KV';
import { Input, Select, Textarea } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { dateInputToIso, todayInput } from '../../lib/dates';
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_OPTIONS,
  type InvoiceStatus,
  type PaymentKind,
  type PaymentMethod,
} from '@shared/schemas';
import { invoiceStatusTone, paymentKindTone } from './helpers';

export default function InvoiceDetail(): JSX.Element {
  const { id = '' } = useParams();
  const toast = useToast();
  const invoice = useAsync(() => api.invoices.get(id), [id]);
  const [statusBusy, setStatusBusy] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [docBusy, setDocBusy] = useState(false);

  if (invoice.status === 'idle' || invoice.status === 'loading') {
    return <div className="row" style={{ justifyContent: 'center', padding: 60 }}><Spinner /></div>;
  }
  if (invoice.status === 'error') {
    return <Alert tone="bad" eyebrow="Error">{invoice.error.message}</Alert>;
  }
  if (!invoice.data) {
    return (
      <div className="page">
        <EmptyState
          title="Invoice not found"
          actions={<Link to={paths.invoices.list}><Button variant="primary">Back to invoices</Button></Link>}
        />
      </div>
    );
  }

  const inv = invoice.data;

  async function moveStatus(next: InvoiceStatus): Promise<void> {
    setStatusBusy(true);
    try {
      await api.invoices.update(inv.id, { status: next });
      toast.ok(`Marked ${INVOICE_STATUS_LABELS[next].toLowerCase()}`);
      invoice.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update');
    } finally {
      setStatusBusy(false);
    }
  }

  async function onVoidPayment(paymentId: string): Promise<void> {
    if (!confirm('Void this payment? It will be removed from the running balance.')) return;
    try {
      await api.payments.void(paymentId);
      toast.ok('Payment voided');
      invoice.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not void');
    }
  }

  async function generateInvoice(): Promise<void> {
    setDocBusy(true);
    try {
      const doc = await api.documents.invoice(inv.id);
      printHtml(doc.html);
      toast.ok(`${doc.title} sent to printer`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate invoice');
    } finally {
      setDocBusy(false);
    }
  }

  async function generateReceipt(paymentId: string): Promise<void> {
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

  return (
    <div className="page fade-up" style={{ maxWidth: 1180 }}>
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Operations · Receivables</div>
          <h1 className="page-title" style={{ fontStyle: 'normal' }}>{inv.number}</h1>
          <div className="row" style={{ marginTop: 10, gap: 10 }}>
            <Badge tone={invoiceStatusTone(inv.status)} dot>{INVOICE_STATUS_LABELS[inv.status]}</Badge>
            <span className="muted">·</span>
            <span>{inv.customer_name}</span>
            <span className="muted">·</span>
            <span className="mono" style={{ fontSize: 13 }}>
              {formatDate(inv.booking_starts_at)} → {formatDate(inv.booking_ends_at)}
            </span>
          </div>
        </div>
        <div className="page-actions">
          {inv.status === 'draft' && (
            <Button variant="primary" loading={statusBusy} onClick={() => { void moveStatus('issued'); }}>
              Issue invoice
            </Button>
          )}
          {inv.status !== 'void' && inv.status !== 'paid' && (
            <Button onClick={() => setShowPay((v) => !v)}>
              {showPay ? 'Cancel payment' : '+ Record payment'}
            </Button>
          )}
          {inv.status === 'paid' && inv.payments.length > 0 ? (
            <Button loading={docBusy} onClick={() => {
              const latestPayment = inv.payments[inv.payments.length - 1];
              void generateReceipt(latestPayment.id);
            }}>Print receipt</Button>
          ) : (
            <Button loading={docBusy} onClick={() => { void generateInvoice(); }}>Print invoice</Button>
          )}
          {(inv.status === 'draft' || inv.status === 'issued') && (
            <Button variant="danger" loading={statusBusy} onClick={() => { void moveStatus('void'); }}>
              Void
            </Button>
          )}
        </div>
      </header>

      {showPay && (
        <PaymentForm
          invoiceId={inv.id}
          balance={inv.balance_due_pesewas}
          alreadyPaid={inv.amount_paid_pesewas}
          onCancel={() => setShowPay(false)}
          onSaved={() => { setShowPay(false); invoice.refresh(); }}
        />
      )}

      <div className="detail-grid fade-up fade-up-1">
        <div className="card">
          <h3 className="card-title">Lines</h3>
          <div className="dtable-wrap" style={{ marginTop: 6 }}>
            <table className="dtable">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="num">Qty</th>
                  <th className="num">Days</th>
                  <th className="num">Unit price</th>
                  <th className="num">Line total</th>
                </tr>
              </thead>
              <tbody>
                {inv.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.description}</td>
                    <td className="num">{l.quantity}</td>
                    <td className="num">{l.days}</td>
                    <td className="num">{formatGhs(l.unit_price_pesewas)}</td>
                    <td className="num">{formatGhs(l.line_total_pesewas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 14, padding: '12px 14px', borderTop: '1px solid var(--rule)' }}>
            <KV label="Subtotal" value={formatGhs(inv.subtotal_pesewas)} />
            {inv.tax_pesewas > 0 && <KV label="Tax" value={formatGhs(inv.tax_pesewas)} />}
            {inv.discount_pesewas > 0 && <KV label="Discount" value={`− ${formatGhs(inv.discount_pesewas)}`} />}
            <div style={{ borderTop: '1px solid var(--rule-soft)', margin: '8px 0' }} />
            <KV label="Total" value={formatGhs(inv.total_pesewas)} bold />
            <KV label="Paid" value={formatGhs(inv.amount_paid_pesewas)} />
            <KV
              label="Balance due"
              value={formatGhs(inv.balance_due_pesewas)}
              bold
              tone={inv.balance_due_pesewas > 0 ? 'bad' : 'ok'}
            />
          </div>

          {inv.notes && (
            <div className="detail-row" style={{ marginTop: 16 }}>
              <span className="detail-key">Notes</span>
              <span className="detail-val" style={{ whiteSpace: 'pre-wrap' }}>{inv.notes}</span>
            </div>
          )}

          <h3 className="card-title" style={{ marginTop: 'var(--s-7)' }}>Payments</h3>
          {inv.payments.length === 0 ? (
            <p className="muted" style={{ fontStyle: 'italic', marginTop: 4 }}>
              No payments recorded yet.
            </p>
          ) : (
            <div className="dtable-wrap" style={{ marginTop: 6 }}>
              <table className="dtable">
                <thead>
                  <tr>
                    <th style={{ width: 140 }}>When</th>
                    <th>Kind</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th className="num">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {inv.payments.map((p) => (
                    <tr key={p.id} style={{ cursor: 'default' }}>
                      <td className="mono" style={{ fontSize: 13 }}>{formatDateTime(p.paid_at)}</td>
                      <td><Badge tone={paymentKindTone(p.kind)}>{PAYMENT_KIND_LABELS[p.kind]}</Badge></td>
                      <td>{PAYMENT_METHOD_LABELS[p.method as PaymentMethod] ?? p.method}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{p.reference || <span className="faint">—</span>}</td>
                      <td className="num">
                        {p.kind === 'refund' ? '− ' : ''}{formatGhs(p.amount_pesewas)}
                      </td>
                      <td>
                        <Button size="sm" variant="ghost" onClick={() => { void generateReceipt(p.id); }}>
                          Print receipt
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { void onVoidPayment(p.id); }}>
                          Void
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card card-warm">
            <span className="eyebrow">Booking</span>
            <h3 style={{ marginTop: 6 }}>{inv.customer_name}</h3>
            <div className="muted mono" style={{ fontSize: 13, marginTop: 2 }}>
              {formatDate(inv.booking_starts_at)} → {formatDate(inv.booking_ends_at)}
            </div>
            <Link to={paths.bookings.detail(inv.booking_id)} style={{ fontSize: 13, marginTop: 8, display: 'inline-block' }}>
              Open booking →
            </Link>
            {inv.due_at && (
              <div style={{ marginTop: 10 }}>
                <span className="eyebrow">Due</span>
                <div className="mono" style={{ fontSize: 14 }}>{formatDate(inv.due_at)}</div>
              </div>
            )}
            {inv.issued_at && (
              <div style={{ marginTop: 10 }}>
                <span className="eyebrow">Issued</span>
                <div className="mono" style={{ fontSize: 14 }}>{formatDateTime(inv.issued_at)}</div>
              </div>
            )}
          </div>
          <AuditCard createdAt={inv.created_at} updatedAt={inv.updated_at} id={inv.id} />
        </div>
      </div>
    </div>
  );
}

function PaymentForm({
  invoiceId,
  balance,
  alreadyPaid,
  onCancel,
  onSaved,
}: {
  invoiceId: string;
  balance: number;
  alreadyPaid: number;
  onCancel: () => void;
  onSaved: () => void;
}): JSX.Element {
  const toast = useToast();
  const [kind, setKind] = useState<PaymentKind>(alreadyPaid === 0 ? 'deposit' : 'payment');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amount, setAmount] = useState(formatPesewasPlain(balance));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [paidAtDate, setPaidAtDate] = useState(todayInput());
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const pesewas = parseCedisToPesewas(amount);
    if (pesewas <= 0) { toast.error('Amount must be positive'); return; }
    setSaving(true);
    try {
      await api.payments.record({
        invoice_id: invoiceId,
        kind,
        method,
        amount_pesewas: pesewas,
        reference: reference || null,
        notes: notes || null,
        paid_at: dateInputToIso(paidAtDate, new Date().toTimeString().slice(0, 5)),
      });
      toast.ok(`${PAYMENT_KIND_LABELS[kind]} recorded`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not record');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="card card-warm fade-up"
      onSubmit={(e) => { void submit(e); }}
      style={{ marginBottom: 24 }}
    >
      <div className="row-between" style={{ marginBottom: 10 }}>
        <span className="eyebrow">Record payment</span>
        <span className="muted mono" style={{ fontSize: 13 }}>
          Balance due: {formatGhs(balance)}
        </span>
      </div>
      <div className="form-grid">
        <Select
          label="Kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as PaymentKind)}
          options={[
            { value: 'deposit', label: PAYMENT_KIND_LABELS.deposit },
            { value: 'payment', label: PAYMENT_KIND_LABELS.payment },
            { value: 'refund', label: PAYMENT_KIND_LABELS.refund },
          ]}
        />
        <Select
          label="Method"
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          options={[...PAYMENT_METHOD_OPTIONS]}
        />
        <Input
          label="Amount"
          mono
          prefix="GH₵"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Input
          label="Date received"
          type="date"
          value={paidAtDate}
          onChange={(e) => setPaidAtDate(e.target.value)}
        />
        <Input
          containerClass="full"
          label="Reference"
          mono
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. MoMo TX 1234567890, cheque #14"
        />
        <Textarea
          containerClass="full"
          label="Notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="form-actions">
        <Button variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" type="submit" loading={saving}>Record</Button>
      </div>
    </form>
  );
}

