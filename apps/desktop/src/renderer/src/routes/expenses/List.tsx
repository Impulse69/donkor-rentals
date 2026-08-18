import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AsyncList } from '../../components/AsyncList';
import { Button, SplitButton } from '../../components/Button';
import { Dropdown } from '../../components/Dropdown';
import { Modal } from '../../components/Modal';
import { Input, Select, Textarea } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { api } from '../../lib/api';
import { formatDate, formatGhs, parseCedisToPesewas } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import {
  EXPENSE_KIND_LABELS,
  EXPENSE_KIND_OPTIONS,
  EXPENSE_STATUS_LABELS,
  EXPENSE_STATUS_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  type ExpenseKind,
  type ExpenseStatus,
  type PaymentMethod,
} from '@shared/schemas';
import { accountName, accountOptions, dateInputToIso, todayInput, vendorName } from './helpers';

export default function ExpensesList(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const kind = searchParams.get('kind') ?? '';
  const status = searchParams.get('status') ?? '';
  const search = searchParams.get('q') ?? '';
  const [draft, setDraft] = useState(search);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAccount, setPayAccount] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [payReference, setPayReference] = useState('');
  const [payDate, setPayDate] = useState(todayInput());
  const [payNotes, setPayNotes] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  const expenses = useAsync(() => api.expenses.list({
    ...(kind ? { kind: kind as ExpenseKind } : {}),
    ...(status ? { status: status as ExpenseStatus } : {}),
    ...(search ? { search } : {}),
  }), [kind, status, search]);
  const vendors = useAsync(() => api.vendors.list({}), []);
  const accounts = useAsync(() => api.accounts.list({}), []);

  function setParam(name: string, value: string): void {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value);
    else next.delete(name);
    setSearchParams(next, { replace: true });
  }

  const expenseRows = expenses.status === 'ok' ? expenses.data : [];
  const selectedBill = payingId ? expenseRows.find((e) => e.id === payingId) ?? null : null;

  async function recordPayment(): Promise<void> {
    if (!selectedBill || !payAccount) {
      toast.error('Payment account is required');
      return;
    }
    const amount = parseCedisToPesewas(payAmount);
    if (amount <= 0) {
      toast.error('Payment amount must be positive');
      return;
    }
    setSavingPayment(true);
    try {
      await api.expenses.recordBillPayment({
        expense_id: selectedBill.id,
        paid_from_account_id: payAccount,
        amount_pesewas: amount,
        method: payMethod,
        reference: payReference.trim() || null,
        paid_at: dateInputToIso(payDate),
        notes: payNotes.trim() || null,
      });
      toast.ok('Bill payment recorded');
      setPayingId(null);
      expenses.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not record bill payment');
    } finally {
      setSavingPayment(false);
    }
  }

  async function voidExpense(id: string): Promise<void> {
    try {
      await api.expenses.void(id);
      toast.ok('Expense voided by reversal');
      expenses.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not void expense');
    }
  }

  return (
    <div className="page fade-up">
      <Modal
        open={Boolean(selectedBill)}
        onClose={() => { if (!savingPayment) setPayingId(null); }}
        title="Record bill payment"
        description={selectedBill ? `Pay ${selectedBill.number} from a cash or bank account.` : undefined}
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={() => setPayingId(null)} disabled={savingPayment}>Cancel</Button>
            <Button type="button" variant="primary" loading={savingPayment} onClick={() => { void recordPayment(); }}>Record payment</Button>
          </>
        )}
      >
        <div className="form-grid">
          <Select label="Payment account" value={payAccount} onChange={(e) => setPayAccount(e.target.value)} options={[{ value: '', label: 'Select account' }, ...(accounts.status === 'ok' ? accountOptions(accounts.data.filter((a) => a.account_type === 'asset')) : [])]} />
          <Input label="Amount" inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
          <Select label="Method" value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)} options={[...PAYMENT_METHOD_OPTIONS]} />
          <Input label="Paid date" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          <Input containerClass="full" label="Reference" value={payReference} onChange={(e) => setPayReference(e.target.value)} />
          <Textarea containerClass="full" label="Notes" rows={2} value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
        </div>
      </Modal>

      <header className="page-head">
        <div><h1 className="page-title">Expenses</h1></div>
        <div className="page-actions"><Link to="/expenses/new"><Button variant="primary">New expense</Button></Link></div>
      </header>

      <form className="dtable-toolbar fade-up fade-up-1" onSubmit={(e) => { e.preventDefault(); setParam('q', draft.trim()); }}>
        <input className="input" style={{ flex: '1 1 0', minWidth: 0 }} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search number, memo, or reference..." aria-label="Search expenses" />
        <select className="select" value={kind} onChange={(e) => setParam('kind', e.target.value)}>
          <option value="">All kinds</option>
          {EXPENSE_KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="select" value={status} onChange={(e) => setParam('status', e.target.value)}>
          <option value="">All statuses</option>
          {EXPENSE_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <Button type="submit">Apply</Button>
      </form>

      <AsyncList state={expenses} loadingLabel="Loading expenses..." emptyTitle="No expenses found">
        {(rows) => (
          <div className="dtable-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Date</th>
                  <th>Payee</th>
                  <th>Category</th>
                  <th>Payment account</th>
                  <th className="num" style={{ width: 120 }}>Total</th>
                  <th style={{ width: 110 }}>Status</th>
                  <th style={{ width: 190 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} onClick={() => navigate(`/expenses/${e.id}`)}>
                    <td className="mono">{formatDate(e.txn_date)}</td>
                    <td>{vendors.status === 'ok' ? vendorName(vendors.data, e.vendor_id) : 'Loading...'}</td>
                    <td><ExpenseCategory expenseId={e.id} accounts={accounts.status === 'ok' ? accounts.data : []} fallback={EXPENSE_KIND_LABELS[e.kind]} /></td>
                    <td>{accounts.status === 'ok' ? accountName(accounts.data, e.payment_account_id) : 'Loading...'}</td>
                    <td className="num">{formatGhs(e.total_pesewas)}</td>
                    <td><span className="badge">{EXPENSE_STATUS_LABELS[e.status]}</span></td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <SplitButton
                        size="sm"
                        onClick={() => navigate(`/expenses/${e.id}`)}
                        menu={(
                          <>
                            <Dropdown.Item onSelect={() => navigate(`/expenses/${e.id}`)}>View</Dropdown.Item>
                            {e.kind === 'bill' && e.status !== 'paid' && e.status !== 'void' && <Dropdown.Item onSelect={() => setPayingId(e.id)}>Record payment</Dropdown.Item>}
                            {e.status !== 'void' && <Dropdown.Item onSelect={() => { void voidExpense(e.id); }}>Void by reversal</Dropdown.Item>}
                          </>
                        )}
                      >
                        {e.kind === 'bill' && e.status !== 'paid' ? 'Record payment' : 'View'}
                      </SplitButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AsyncList>
    </div>
  );
}

function ExpenseCategory({
  expenseId,
  accounts,
  fallback,
}: {
  expenseId: string;
  accounts: Awaited<ReturnType<typeof api.accounts.list>>;
  fallback: string;
}): JSX.Element {
  const detail = useAsync(() => api.expenses.get(expenseId), [expenseId]);
  if (detail.status !== 'ok' || !detail.data?.lines.length) return <>{fallback}</>;
  const first = detail.data.lines[0];
  const suffix = detail.data.lines.length > 1 ? ` +${detail.data.lines.length - 1}` : '';
  return <>{accountName(accounts, first.account_id)}{suffix}</>;
}
