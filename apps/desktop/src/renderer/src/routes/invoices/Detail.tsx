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
import { ActionBar } from '../../components/ActionBar';
import { Button, SplitButton } from '../../components/Button';
import { Dropdown } from '../../components/Dropdown';
import { Badge } from '../../components/Badge';
import { StatusPill, type StatusPillStatus } from '../../components/StatusPill';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { Alert } from '../../components/Alert';
import { AuditCard } from '../../components/AuditCard';
import { KV } from '../../components/KV';
import { Modal } from '../../components/Modal';
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
import { paymentKindTone } from './helpers';

function customerLabel(row: { customer_name?: string | null; renter_name?: string | null }): string {
  return row.customer_name?.trim() || row.renter_name?.trim() || 'Walk-in rental';
}

function invoiceDetailStatus(row: {
  status: InvoiceStatus;
  due_at: string | null;
  balance_due_pesewas: number;
}): StatusPillStatus {
  if (
    row.status === 'issued'
    && row.balance_due_pesewas > 0
    && row.due_at
    && new Date(row.due_at).getTime() < Date.now()
  ) {
    return 'overdue';
  }
  return row.status;
}

export default function InvoiceDetail(): JSX.Element {
  const { id = '' } = useParams();
  const toast = useToast();
  const invoice = useAsync(() => api.invoices.get(id), [id]);
  const [statusBusy, setStatusBusy] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [docBusy, setDocBusy] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  // Default to the invoice's saved format, but the modal lets staff override per print run.
  const [printAsStatutory, setPrintAsStatutory] = useState<boolean>(true);

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
  const billTo = customerLabel(inv);
  const paymentTerms = `${inv.initial_payment_percent}% initial / ${inv.before_delivery_percent}% before delivery`;

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

  function openPrintChooser(): void {
    // Pre-select whatever the invoice was saved as; staff can override before printing.
    setPrintAsStatutory(inv.include_statutory_taxes);
    setPrintOpen(true);
  }

  async function generateInvoice(overrideStatutory: boolean): Promise<void> {
    setDocBusy(true);
    try {
      // Only send the override if it differs from the persisted format — otherwise
      // the backend uses the stored breakdown as-is (cheaper, fewer round-trips).
      const options = overrideStatutory !== inv.include_statutory_taxes
        ? { overrideStatutory }
        : undefined;
      const doc = await api.documents.invoice(inv.id, options);
      printHtml(doc.html);
      setPrintOpen(false);
      toast.ok(`${doc.title} (${overrideStatutory ? 'Statutory' : 'Simple'}) sent to printer`);
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

  // Where this invoice sits in the chain, read from the figures rather than the
  // status flag alone. `settled` means nothing is owed; a draft can be settled
  // (money taken before the invoice was issued) and an issued invoice can carry
  // payments and still owe something.
  const settled = inv.balance_due_pesewas <= 0;
  const hasPayments = inv.payments.length > 0;
  const isVoid = inv.status === 'void';
  const canTakePayment = !isVoid && !settled;
  const canPrintReceipt = !isVoid && hasPayments;

  /** The single next step, and so the single green button. */
  const chainStep: 'issue' | 'pay' | 'receipt' | null = isVoid
    ? null
    : inv.status === 'draft'
      ? 'issue'
      : !settled
        ? 'pay'
        : hasPayments
          ? 'receipt'
          : null;

  async function printLatestReceipt(): Promise<void> {
    const latest = inv.payments[inv.payments.length - 1];
    if (latest) await generateReceipt(latest.id);
  }

  const chainLabel =
    chainStep === 'issue' ? 'Save and issue'
      : chainStep === 'pay' ? (showPay ? 'Cancel payment' : 'Record payment')
        : 'Print receipt';

  function runChainStep(): void {
    if (chainStep === 'issue') void moveStatus('issued');
    else if (chainStep === 'pay') setShowPay((v) => !v);
    else if (chainStep === 'receipt') void printLatestReceipt();
  }

  /* Everything still applicable that is not the next step. Destructive last. */
  const secondaryActions = (
    <>
      {canTakePayment && chainStep !== 'pay' && (
        <Dropdown.Item onSelect={() => setShowPay((v) => !v)}>
          {showPay ? 'Cancel payment' : 'Record payment'}
        </Dropdown.Item>
      )}
      {canPrintReceipt && chainStep !== 'receipt' && (
        <Dropdown.Item onSelect={() => { void printLatestReceipt(); }}>Print receipt</Dropdown.Item>
      )}
      {(inv.status === 'draft' || inv.status === 'issued') && (
        <>
          <Dropdown.Divider />
          <Dropdown.Item danger onSelect={() => { void moveStatus('void'); }}>Void invoice</Dropdown.Item>
        </>
      )}
    </>
  );

  // --- Print-format chooser preview math (no IPC; render-only) ----------
  const subtotalP = inv.subtotal_pesewas;
  const discountP = inv.discount_pesewas;
  const previewNhil = Math.round(subtotalP * 0.025);
  const previewGetfund = Math.round(subtotalP * 0.025);
  const previewVat = Math.round((subtotalP + previewNhil + previewGetfund) * 0.15);
  const previewStatTotal = Math.max(0, subtotalP + previewNhil + previewGetfund + previewVat - discountP);
  const previewSimpleTotal = Math.max(0, subtotalP - discountP);

  return (
    <div className="page invoice-page fade-up" style={{ maxWidth: 1180 }}>
      <Modal
        open={printOpen}
        onClose={() => { if (!docBusy) setPrintOpen(false); }}
        title="Print invoice"
        description="Pick a format for this print run. The saved invoice is not changed."
        size="md"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setPrintOpen(false)} disabled={docBusy}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={docBusy}
              onClick={() => { void generateInvoice(printAsStatutory); }}
            >
              Print as {printAsStatutory ? 'Statutory' : 'Simple'}
            </Button>
          </>
        }
      >
        <div className="print-format-grid">
          <PrintFormatOption
            selected={printAsStatutory}
            onSelect={() => setPrintAsStatutory(true)}
            label="Statutory"
            sub="NHIL · GETFund · VAT broken out"
            ariaLabel="Print with statutory tax breakdown"
            rows={[
              { k: 'Subtotal',       v: formatGhs(subtotalP),    muted: true },
              { k: 'NHIL (2.5%)',    v: formatGhs(previewNhil),  muted: true },
              { k: 'GETFund (2.5%)', v: formatGhs(previewGetfund), muted: true },
              { k: 'VAT (15%)',      v: formatGhs(previewVat),   muted: true },
              ...(discountP > 0
                ? [{ k: 'Discount', v: `− ${formatGhs(discountP)}`, muted: true }]
                : []),
              { k: 'Total Amount',   v: formatGhs(previewStatTotal), strong: true },
            ]}
          />
          <PrintFormatOption
            selected={!printAsStatutory}
            onSelect={() => setPrintAsStatutory(false)}
            label="Simple"
            sub="Subtotal only — no statutory lines"
            ariaLabel="Print without statutory tax breakdown"
            rows={[
              { k: 'Subtotal', v: formatGhs(subtotalP), muted: true },
              ...(discountP > 0
                ? [{ k: 'Discount', v: `− ${formatGhs(discountP)}`, muted: true }]
                : []),
              { k: 'Total Amount', v: formatGhs(previewSimpleTotal), strong: true },
            ]}
          />
        </div>
        {printAsStatutory !== inv.include_statutory_taxes && (
          <Alert
            tone="info"
            compact
            eyebrow="Print override"
            title={`This print will differ from the invoice's saved format (${inv.include_statutory_taxes ? 'Statutory' : 'Simple'}).`}
          >
            The change applies only to this printout. The invoice record stays as-is.
          </Alert>
        )}
      </Modal>

      <header className="invoice-hero">
        <div className="invoice-hero-main">
          <div className="page-eyebrow">Operations / Receivables</div>
          <div className="invoice-title-row">
            <h1 className="page-title invoice-title">{inv.number}</h1>
            <StatusPill status={invoiceDetailStatus(inv)} />
          </div>
          <div className="invoice-subline">
            <span>{billTo}</span>
            <span className="mono">{formatDate(inv.booking_starts_at)} to {formatDate(inv.booking_ends_at)}</span>
          </div>
        </div>
        <div className="invoice-balance-box">
          <span>Balance due</span>
          <strong>{formatGhs(inv.balance_due_pesewas)}</strong>
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

      <section className="invoice-meta-band fade-up fade-up-1">
        <div>
          <span className="invoice-meta-label">Bill to</span>
          <strong>{billTo}</strong>
          <Link to={paths.bookings.detail(inv.booking_id)}>Open booking</Link>
        </div>
        <div className="invoice-meta-dates">
          <KV label="Invoice date" value={inv.issued_at ? formatDate(inv.issued_at) : 'Draft'} />
          <KV label="Due date" value={inv.due_at ? formatDate(inv.due_at) : '--'} />
          <KV label="Terms" value={paymentTerms} />
        </div>
      </section>

      <div className="invoice-sheet fade-up fade-up-2">
        <section>
          <div className="dtable-wrap invoice-lines">
            <table className="dtable">
              <thead>
                <tr>
                  <th style={{ width: 52 }}>#</th>
                  <th>Product or service</th>
                  <th>Description</th>
                  <th className="num">Qty</th>
                  <th className="num">Rate</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {inv.lines.map((l, index) => (
                  <tr key={l.id}>
                    <td className="mono faint">{index + 1}</td>
                    <td>{l.description}</td>
                    <td>{l.days} day{l.days === 1 ? '' : 's'} rental</td>
                    <td className="num">{l.quantity}</td>
                    <td className="num">{formatGhs(l.unit_price_pesewas)}</td>
                    <td className="num">{formatGhs(l.line_total_pesewas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="invoice-summary-row">
            <div className="invoice-format-note">
              <Badge tone={inv.include_statutory_taxes ? 'gold' : 'neutral'}>
                {inv.include_statutory_taxes ? 'Statutory' : 'Simple'}
              </Badge>
              <span className="muted">{paymentTerms}</span>
            </div>
            <table className="invoice-totals">
              <tbody>
                <tr><td>Subtotal</td><td className="num">{formatGhs(inv.subtotal_pesewas)}</td></tr>
                {inv.include_statutory_taxes && (
                  <>
                    <tr><td>NHIL</td><td className="num">{formatGhs(inv.nhil_pesewas)}</td></tr>
                    <tr><td>GETFund</td><td className="num">{formatGhs(inv.getfund_pesewas)}</td></tr>
                    <tr><td>VAT</td><td className="num">{formatGhs(inv.vat_pesewas)}</td></tr>
                  </>
                )}
                {inv.tax_pesewas > 0 && <tr><td>Other tax</td><td className="num">{formatGhs(inv.tax_pesewas)}</td></tr>}
                <tr><td>Discount</td><td className="num">{inv.discount_pesewas > 0 ? `- ${formatGhs(inv.discount_pesewas)}` : formatGhs(0)}</td></tr>
                <tr className="is-total"><td>Total</td><td className="num">{formatGhs(inv.total_pesewas)}</td></tr>
                <tr><td>Payments received</td><td className="num">{formatGhs(inv.amount_paid_pesewas)}</td></tr>
                <tr className="is-balance"><td>Balance due</td><td className="num">{formatGhs(inv.balance_due_pesewas)}</td></tr>
              </tbody>
            </table>
          </div>

          {inv.notes && (
            <div className="detail-row invoice-notes">
              <span className="detail-key">Notes</span>
              <span className="detail-val" style={{ whiteSpace: 'pre-wrap' }}>{inv.notes}</span>
            </div>
          )}

          <h3 className="card-title invoice-section-title">Payments</h3>
          {inv.payments.length === 0 ? (
            <div className="invoice-empty-row">No payments recorded yet.</div>
          ) : (
            <div className="dtable-wrap" style={{ marginTop: 6 }}>
              <table className="dtable">
                <thead>
                  <tr>
                    <th style={{ width: 140 }}>Date</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th>Kind</th>
                    <th className="num">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {inv.payments.map((p) => (
                    <tr key={p.id} style={{ cursor: 'default' }}>
                      <td className="mono" style={{ fontSize: 13 }}>{formatDateTime(p.paid_at)}</td>
                      <td>{PAYMENT_METHOD_LABELS[p.method as PaymentMethod] ?? p.method}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{p.reference || <span className="faint">--</span>}</td>
                      <td><Badge tone={paymentKindTone(p.kind)}>{PAYMENT_KIND_LABELS[p.kind]}</Badge></td>
                      <td className="num">
                        {p.kind === 'refund' ? '- ' : ''}{formatGhs(p.amount_pesewas)}
                      </td>
                      <td className="invoice-payment-actions">
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
        </section>

        <section className="invoice-support">
          <div className="card card-warm">
            <span className="eyebrow">Booking</span>
            <h3>{billTo}</h3>
            <KV label="Rental window" value={`${formatDate(inv.booking_starts_at)} to ${formatDate(inv.booking_ends_at)}`} />
            {inv.issued_at && <KV label="Issued" value={formatDateTime(inv.issued_at)} />}
            {inv.due_at && <KV label="Due" value={formatDate(inv.due_at)} />}
          </div>
          <AuditCard createdAt={inv.created_at} updatedAt={inv.updated_at} id={inv.id} />
        </section>
      </div>

      <ActionBar label="Invoice actions">
        <div className="invoice-actionbar-left">
          <Link to={paths.invoices.list}>
            <Button variant="ghost">Cancel</Button>
          </Link>
        </div>
        <div className="invoice-actionbar-right">
          {/*
            One green button for the next step, one plain button for the thing
            people reach for constantly, and everything else folded away.

            Five buttons across the bottom — two of them coloured, with the red
            Void sitting against the green primary — is not a set of choices, it
            is a wall. Worse, the destructive action was the immediate neighbour
            of the one people press every time. Void now lives at the foot of
            the menu, behind a divider and a second click.
          */}
          <Button onClick={openPrintChooser}>Print</Button>
          {chainStep === null ? (
            <Dropdown trigger={<Button aria-label="More actions">More ▾</Button>}>
              {secondaryActions}
            </Dropdown>
          ) : (
            <SplitButton
              loading={statusBusy || docBusy}
              onClick={runChainStep}
              menu={secondaryActions}
            >
              {chainLabel}
            </SplitButton>
          )}
        </div>
      </ActionBar>
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

// --- Print-format chooser sub-component --------------------------------------
interface FormatRow { k: string; v: string; muted?: boolean; strong?: boolean }
function PrintFormatOption({
  selected,
  onSelect,
  label,
  sub,
  ariaLabel,
  rows,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  sub: string;
  ariaLabel: string;
  rows: FormatRow[];
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={`print-format-option${selected ? ' is-selected' : ''}`}
    >
      <div className="print-format-head">
        <span className="print-format-radio" aria-hidden>
          <span className="dot" />
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="print-format-label">{label}</span>
          <span className="print-format-sub">{sub}</span>
        </div>
      </div>
      <table className="print-format-totals">
        <tbody>
          {rows.map((r) => (
            <tr key={r.k} className={r.strong ? 'is-grand' : ''}>
              <td className={r.muted ? 'muted' : ''}>{r.k}</td>
              <td className="num">{r.v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </button>
  );
}


