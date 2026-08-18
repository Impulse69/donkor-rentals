import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Input, Textarea } from '../../components/Field';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { api } from '../../lib/api';
import { formatDate, formatGhs, formatPesewasPlain, parseCedisToPesewas } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { accountLabel, accountName, todayInput } from './helpers';

interface DraftLine {
  account_id: string;
  debit: string;
  credit: string;
  memo: string;
  name: string;
}

const blankLine = (): DraftLine => ({ account_id: '', debit: '', credit: '', memo: '', name: '' });

export default function JournalForm(): JSX.Element {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isNew = !id;
  const entry = useAsync(() => (id ? api.journal.get(id) : Promise.resolve(null)), [id]);
  const accounts = useAsync(() => api.accounts.list({}), []);
  const [date, setDate] = useState(todayInput());
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([blankLine(), blankLine()]);
  const [saving, setSaving] = useState(false);

  const entryData = entry.status === 'ok' ? entry.data : null;
  const accountRows = accounts.status === 'ok' ? accounts.data : [];
  const hydratedLines = isNew || !entryData || accounts.status !== 'ok' ? null : entryData.lines.map((l) => ({
      account_id: l.account_id,
      debit: l.debit_pesewas ? formatPesewasPlain(l.debit_pesewas) : '',
      credit: l.credit_pesewas ? formatPesewasPlain(l.credit_pesewas) : '',
      memo: l.memo ?? '',
      name: accountName(accountRows, l.account_id),
    }));

  const activeLines = hydratedLines ?? lines;
  const debitTotal = activeLines.reduce((sum, l) => sum + parseCedisToPesewas(l.debit), 0);
  const creditTotal = activeLines.reduce((sum, l) => sum + parseCedisToPesewas(l.credit), 0);
  const balanced = debitTotal > 0 && debitTotal === creditTotal && activeLines.filter((l) => l.account_id).length >= 2;

  function updateLine(index: number, patch: Partial<DraftLine>): void {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!balanced) {
      toast.error('Debits and credits must match before saving');
      return;
    }
    setSaving(true);
    try {
      await api.journal.createManual({
        entry_date: date,
        memo: memo.trim() || null,
        source_type: 'manual',
        source_id: null,
        source_event: 'manual',
        source_key: `manual:${crypto.randomUUID()}`,
        lines: lines
          .filter((l) => l.account_id)
          .map((l) => ({
            account_id: l.account_id,
            debit_pesewas: parseCedisToPesewas(l.debit),
            credit_pesewas: parseCedisToPesewas(l.credit),
            memo: l.memo.trim() || null,
            customer_id: null,
            vendor_id: null,
            item_id: null,
            item_unit_id: null,
          })),
      });
      toast.ok('Journal entry saved');
      navigate('/accounting/journal');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save journal entry');
    } finally {
      setSaving(false);
    }
  }

  if (!isNew && (entry.status === 'idle' || entry.status === 'loading')) {
    return <div className="row" style={{ justifyContent: 'center', padding: 60 }}><Spinner /></div>;
  }
  if (!isNew && entry.status === 'error') {
    return <Alert tone="bad" eyebrow="Error" title="Could not load journal entry">{entry.error.message}</Alert>;
  }
  if (!isNew && entry.status === 'ok' && !entry.data) {
    return <div className="page"><EmptyState title="Journal entry not found" actions={<Link to="/accounting/journal"><Button>Back to journal</Button></Link>} /></div>;
  }

  const accountOptions = accountRows.map((a) => ({ value: a.id, label: accountLabel(a) }));

  return (
    <div className="page invoice-page fade-up" style={{ maxWidth: 1120 }}>
      <header className="invoice-hero">
        <div className="invoice-hero-main">
          <div className="page-eyebrow">Accounting / Journal</div>
          <h1 className="page-title invoice-title">{isNew ? 'New journal entry' : entry.data?.entry_no}</h1>
          {!isNew && entry.data && <div className="invoice-subline"><span>{formatDate(entry.data.entry_date)}</span><span>{entry.data.origin}</span></div>}
        </div>
        <div className="invoice-balance-box">
          <span>Debits</span>
          <strong>{formatGhs(debitTotal)}</strong>
        </div>
      </header>

      <form onSubmit={(e) => { void submit(e); }}>
        <section className="invoice-meta-band fade-up fade-up-1">
          {isNew ? (
            <>
              <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <Input label="Journal no." value="Assigned on save" disabled />
              <Textarea label="Memo" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
            </>
          ) : (
            <>
              <div><span className="invoice-meta-label">Date</span><strong>{entry.data ? formatDate(entry.data.entry_date) : '--'}</strong></div>
              <div><span className="invoice-meta-label">Journal no.</span><strong>{entry.data?.entry_no}</strong></div>
              <div><span className="invoice-meta-label">Memo</span><strong>{entry.data?.memo || '--'}</strong></div>
            </>
          )}
        </section>

        <div className="invoice-sheet fade-up fade-up-2" style={{ display: 'block' }}>
          <div className="dtable-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="num" style={{ width: 130 }}>Debits</th>
                  <th className="num" style={{ width: 130 }}>Credits</th>
                  <th>Description</th>
                  <th style={{ width: 150 }}>Name</th>
                  {isNew && <th style={{ width: 70 }} />}
                </tr>
              </thead>
              <tbody>
                {activeLines.map((line, index) => (
                  <tr key={index} style={{ cursor: 'default' }}>
                    <td>
                      {isNew ? (
                        <select className="select" value={line.account_id} onChange={(e) => updateLine(index, { account_id: e.target.value })}>
                          <option value="">Select account</option>
                          {accountOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : line.name}
                    </td>
                    <td className="num">
                      {isNew ? <input className="input num" value={line.debit} onChange={(e) => updateLine(index, { debit: e.target.value, credit: e.target.value ? '' : line.credit })} /> : (line.debit || <span className="faint">--</span>)}
                    </td>
                    <td className="num">
                      {isNew ? <input className="input num" value={line.credit} onChange={(e) => updateLine(index, { credit: e.target.value, debit: e.target.value ? '' : line.debit })} /> : (line.credit || <span className="faint">--</span>)}
                    </td>
                    <td>{isNew ? <input className="input" value={line.memo} onChange={(e) => updateLine(index, { memo: e.target.value })} /> : (line.memo || <span className="faint">--</span>)}</td>
                    <td>{isNew ? <input className="input" value={line.name} onChange={(e) => updateLine(index, { name: e.target.value })} /> : <span className="faint">--</span>}</td>
                    {isNew && (
                      <td>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>Remove</Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">{formatGhs(debitTotal)}</td>
                  <td className="num">{formatGhs(creditTotal)}</td>
                  <td colSpan={isNew ? 3 : 2}>{debitTotal === creditTotal ? 'Balanced' : 'Debits and credits must match'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {isNew && <Button type="button" style={{ marginTop: 12 }} onClick={() => setLines((current) => [...current, blankLine()])}>Add line</Button>}
        </div>

        <div className="invoice-actionbar" role="toolbar" aria-label="Journal actions">
          <div className="invoice-actionbar-left">
            <Link to="/accounting/journal"><Button type="button" variant="ghost">Cancel</Button></Link>
          </div>
          <div className="invoice-actionbar-right">
            {isNew && <Button type="submit" variant="primary" loading={saving} disabled={!balanced}>Save</Button>}
          </div>
        </div>
      </form>
    </div>
  );
}
