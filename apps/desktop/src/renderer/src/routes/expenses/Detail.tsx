import { Link, useParams } from 'react-router-dom';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Spinner } from '../../components/Spinner';
import { api } from '../../lib/api';
import { formatDate, formatGhs } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { EXPENSE_KIND_LABELS, EXPENSE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@shared/schemas';
import { accountName, vendorName } from './helpers';

export default function ExpenseDetail(): JSX.Element {
  const { id = '' } = useParams();
  const expense = useAsync(() => api.expenses.get(id), [id]);
  const vendors = useAsync(() => api.vendors.list({}), []);
  const accounts = useAsync(() => api.accounts.list({}), []);

  if (expense.status === 'idle' || expense.status === 'loading') {
    return <div className="row" style={{ justifyContent: 'center', padding: 60 }}><Spinner /></div>;
  }
  if (expense.status === 'error') {
    return <Alert tone="bad" eyebrow="Error" title="Could not load expense">{expense.error.message}</Alert>;
  }
  if (!expense.data) {
    return <div className="page"><EmptyState title="Expense not found" actions={<Link to="/expenses"><Button>Back to expenses</Button></Link>} /></div>;
  }

  const e = expense.data;
  const accountRows = accounts.status === 'ok' ? accounts.data : [];
  const vendorRows = vendors.status === 'ok' ? vendors.data : [];

  return (
    <div className="page invoice-page fade-up" style={{ maxWidth: 1120 }}>
      <header className="invoice-hero">
        <div className="invoice-hero-main">
          <div className="page-eyebrow">Expenses / {EXPENSE_KIND_LABELS[e.kind]}</div>
          <h1 className="page-title invoice-title">{e.number}</h1>
          <div className="invoice-subline"><span>{vendorName(vendorRows, e.vendor_id)}</span><span>{EXPENSE_STATUS_LABELS[e.status]}</span></div>
        </div>
        <div className="invoice-balance-box"><span>Total</span><strong>{formatGhs(e.total_pesewas)}</strong></div>
      </header>

      <section className="invoice-meta-band fade-up fade-up-1">
        <div><span className="invoice-meta-label">Date</span><strong>{formatDate(e.txn_date)}</strong></div>
        {e.due_date && <div><span className="invoice-meta-label">Due date</span><strong>{formatDate(e.due_date)}</strong></div>}
        <div><span className="invoice-meta-label">Payment account</span><strong>{accountName(accountRows, e.payment_account_id)}</strong></div>
        <div><span className="invoice-meta-label">Method</span><strong>{e.payment_method ? PAYMENT_METHOD_LABELS[e.payment_method] : '--'}</strong></div>
      </section>

      <div className="invoice-sheet fade-up fade-up-2" style={{ display: 'block' }}>
        <div className="dtable-wrap">
          <table className="dtable">
            <thead>
              <tr>
                <th>Category</th>
                <th>Description</th>
                <th className="num" style={{ width: 150 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {e.lines.map((line) => (
                <tr key={line.id} style={{ cursor: 'default' }}>
                  <td>{accountName(accountRows, line.account_id)}</td>
                  <td>{line.description}</td>
                  <td className="num">{formatGhs(line.amount_pesewas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <table className="invoice-totals" style={{ marginLeft: 'auto', marginTop: 'var(--s-5)' }}>
          <tbody>
            <tr><td>Subtotal</td><td className="num">{formatGhs(e.subtotal_pesewas)}</td></tr>
            <tr><td>Tax</td><td className="num">{formatGhs(e.tax_pesewas)}</td></tr>
            <tr className="is-total"><td>Total</td><td className="num">{formatGhs(e.total_pesewas)}</td></tr>
            {e.kind === 'bill' && <tr><td>Paid</td><td className="num">{formatGhs(e.paid_pesewas)}</td></tr>}
            {e.kind === 'bill' && <tr className="is-balance"><td>Balance due</td><td className="num">{formatGhs(e.balance_due_pesewas)}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="invoice-actionbar" role="toolbar" aria-label="Expense actions">
        <div className="invoice-actionbar-left"><Link to="/expenses"><Button variant="ghost">Back</Button></Link></div>
      </div>
    </div>
  );
}
