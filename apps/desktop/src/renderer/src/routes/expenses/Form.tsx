import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Input, Select, Textarea } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { api } from '../../lib/api';
import { formatGhs, parseCedisToPesewas } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { EXPENSE_KIND_OPTIONS, PAYMENT_METHOD_OPTIONS, type ExpenseKind, type PaymentMethod } from '@shared/schemas';
import { accountOptions, todayInput } from './helpers';

interface LineState {
  account_id: string;
  description: string;
  amount: string;
}

const blankLine = (): LineState => ({ account_id: '', description: '', amount: '' });

export default function ExpenseForm(): JSX.Element {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const initialKind = searchParams.get('kind') === 'bill' ? 'bill' : 'expense';
  const [kind, setKind] = useState<ExpenseKind>(initialKind);

  // Going from "+ New > Expense" to "+ New > Bill" only changes the query
  // string, so the router keeps this component mounted and the useState
  // initialiser never re-runs — you would land on a bill URL showing an expense
  // form, which posts to the wrong account. Re-sync when the param changes.
  // Toggling the Kind select by hand does not move initialKind, so this does
  // not fight the user.
  useEffect(() => {
    setKind(initialKind);
  }, [initialKind]);
  const [vendorId, setVendorId] = useState('');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [txnDate, setTxnDate] = useState(todayInput());
  const [dueDate, setDueDate] = useState(todayInput());
  const [reference, setReference] = useState('');
  const [memo, setMemo] = useState('');
  const [tax, setTax] = useState('');
  const [lines, setLines] = useState<LineState[]>([blankLine()]);
  const [saving, setSaving] = useState(false);

  const vendors = useAsync(() => api.vendors.list({}), []);
  const accounts = useAsync(() => api.accounts.list({}), []);
  const expenseAccounts = accounts.status === 'ok' ? accounts.data.filter((a) => a.account_type === 'expense') : [];
  const assetAccounts = accounts.status === 'ok' ? accounts.data.filter((a) => a.account_type === 'asset') : [];
  const total = useMemo(() => lines.reduce((sum, line) => sum + parseCedisToPesewas(line.amount), 0) + parseCedisToPesewas(tax), [lines, tax]);

  function updateLine(index: number, patch: Partial<LineState>): void {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const parsedLines = lines
      .map((line, index) => ({
        account_id: line.account_id,
        description: line.description.trim() || 'Expense line',
        quantity: 1,
        unit_amount_pesewas: parseCedisToPesewas(line.amount),
        amount_pesewas: parseCedisToPesewas(line.amount),
        item_unit_id: null,
        sort_order: index,
      }))
      .filter((line) => line.account_id && line.amount_pesewas > 0);
    if (parsedLines.length === 0) {
      toast.error('Add at least one category line');
      return;
    }
    if (kind === 'expense' && !paymentAccountId) {
      toast.error('Payment account is required for expenses');
      return;
    }
    setSaving(true);
    try {
      const created = await api.expenses.create({
        vendor_id: vendorId || null,
        kind,
        number: '',
        status: 'recorded',
        txn_date: txnDate,
        due_date: kind === 'bill' ? dueDate : null,
        payment_account_id: kind === 'expense' ? paymentAccountId : null,
        payment_method: kind === 'expense' ? paymentMethod : null,
        reference: reference.trim() || null,
        memo: memo.trim() || null,
        subtotal_pesewas: 0,
        tax_pesewas: parseCedisToPesewas(tax),
        total_pesewas: 0,
        item_unit_id: null,
        lines: parsedLines,
      });
      toast.ok(`${kind === 'bill' ? 'Bill' : 'Expense'} recorded`);
      navigate(`/expenses/${created.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save expense');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page invoice-page fade-up" style={{ maxWidth: 1120 }}>
      <header className="invoice-hero">
        <div className="invoice-hero-main">
          <div className="page-eyebrow">Expenses</div>
          <h1 className="page-title invoice-title">{kind === 'bill' ? 'New bill' : 'New expense'}</h1>
        </div>
        <div className="invoice-balance-box"><span>Total</span><strong>{formatGhs(total)}</strong></div>
      </header>

      <form onSubmit={(e) => { void submit(e); }}>
        <section className="invoice-meta-band fade-up fade-up-1">
          <Select label="Kind" value={kind} onChange={(e) => setKind(e.target.value as ExpenseKind)} options={[...EXPENSE_KIND_OPTIONS]} />
          <Select label="Payee" value={vendorId} onChange={(e) => setVendorId(e.target.value)} options={[{ value: '', label: 'No vendor' }, ...(vendors.status === 'ok' ? vendors.data.map((v) => ({ value: v.id, label: v.name })) : [])]} />
          <Input label="Payment date" type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} />
          {kind === 'bill' ? (
            <Input label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          ) : (
            <Select label="Payment account" value={paymentAccountId} onChange={(e) => setPaymentAccountId(e.target.value)} options={[{ value: '', label: 'Select account' }, ...accountOptions(assetAccounts)]} />
          )}
          {kind === 'expense' && <Select label="Payment method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} options={[...PAYMENT_METHOD_OPTIONS]} />}
          <Input label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        </section>

        <div className="invoice-sheet fade-up fade-up-2" style={{ display: 'block' }}>
          <div className="dtable-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Description</th>
                  <th className="num" style={{ width: 150 }}>Amount</th>
                  <th style={{ width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={index} style={{ cursor: 'default' }}>
                    <td>
                      <select className="select" value={line.account_id} onChange={(e) => updateLine(index, { account_id: e.target.value })}>
                        <option value="">Select category</option>
                        {accountOptions(expenseAccounts).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td><input className="input" value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })} /></td>
                    <td><input className="input num" value={line.amount} onChange={(e) => updateLine(index, { amount: e.target.value })} /></td>
                    <td><Button type="button" size="sm" variant="ghost" onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>Remove</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-grid" style={{ marginTop: 'var(--s-4)' }}>
            <Input label="Tax" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} />
            <Textarea containerClass="full" label="Memo" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>
          <Button type="button" style={{ marginTop: 12 }} onClick={() => setLines((current) => [...current, blankLine()])}>Add line</Button>
        </div>

        <div className="invoice-actionbar" role="toolbar" aria-label="Expense actions">
          <div className="invoice-actionbar-left"><Link to="/expenses"><Button type="button" variant="ghost">Cancel</Button></Link></div>
          <div className="invoice-actionbar-right"><Button type="submit" variant="primary" loading={saving}>Save</Button></div>
        </div>
      </form>
    </div>
  );
}
