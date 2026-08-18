import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { formatDate, formatGhs } from '../../lib/format';
import { Button, SplitButton } from '../../components/Button';
import { Dropdown } from '../../components/Dropdown';
import { AsyncList } from '../../components/AsyncList';
import { Modal } from '../../components/Modal';
import { Textarea } from '../../components/Field';
import { useToast } from '../../components/Toast';
import {
  JOURNAL_ORIGIN_LABELS,
  JOURNAL_ORIGIN_OPTIONS,
  JOURNAL_SOURCE_TYPE_LABELS,
  JOURNAL_SOURCE_TYPE_OPTIONS,
  type JournalOrigin,
  type JournalSourceType,
} from '@shared/schemas';
import { monthStartInput, todayInput } from './helpers';

export default function JournalList(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const dateFrom = searchParams.get('dateFrom') ?? monthStartInput();
  const dateTo = searchParams.get('dateTo') ?? todayInput();
  const origin = searchParams.get('origin') ?? '';
  const sourceType = searchParams.get('sourceType') ?? '';
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const journal = useAsync(() => api.journal.list({
    dateFrom,
    dateTo,
    ...(origin ? { origin: origin as JournalOrigin } : {}),
    ...(sourceType ? { sourceType: sourceType as JournalSourceType } : {}),
  }), [dateFrom, dateTo, origin, sourceType]);

  function setParam(name: string, value: string): void {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value);
    else next.delete(name);
    setSearchParams(next, { replace: true });
  }

  async function runVoid(): Promise<void> {
    if (!voidingId) return;
    setBusy(true);
    try {
      await api.journal.void(voidingId, todayInput(), reason.trim() || 'Journal entry voided');
      toast.ok('Reversal journal entry posted');
      setVoidingId(null);
      setReason('');
      journal.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not void journal entry');
    } finally {
      setBusy(false);
    }
  }

  const journalRows = journal.status === 'ok' ? journal.data : [];
  const totals = journalRows.reduce((sum, entry) => (
    sum + entry.lines.reduce((s, l) => s + l.debit_pesewas, 0)
  ), 0);

  return (
    <div className="page fade-up">
      <Modal
        open={Boolean(voidingId)}
        onClose={() => { if (!busy) setVoidingId(null); }}
        title="Void journal entry"
        description="Voiding does not delete the original entry. It posts an equal and opposite reversal."
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={() => setVoidingId(null)} disabled={busy}>Cancel</Button>
            <Button type="button" variant="danger" loading={busy} onClick={() => { void runVoid(); }}>Post reversal</Button>
          </>
        )}
      >
        <Textarea label="Reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>

      <header className="page-head">
        <div>
          <h1 className="page-title">Journal Entries</h1>
          <div className="muted" style={{ marginTop: 6 }}>Voids are reversing entries, not deletions.</div>
        </div>
        <div className="page-actions">
          <Link to="/accounting/journal/new"><Button variant="primary">New journal entry</Button></Link>
        </div>
      </header>

      <div className="dtable-toolbar fade-up fade-up-1">
        <input className="input" type="date" value={dateFrom} onChange={(e) => setParam('dateFrom', e.target.value)} aria-label="Date from" />
        <input className="input" type="date" value={dateTo} onChange={(e) => setParam('dateTo', e.target.value)} aria-label="Date to" />
        <select className="select" value={origin} onChange={(e) => setParam('origin', e.target.value)} aria-label="Origin">
          <option value="">All origins</option>
          {JOURNAL_ORIGIN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="select" value={sourceType} onChange={(e) => setParam('sourceType', e.target.value)} aria-label="Source type">
          <option value="">All sources</option>
          {JOURNAL_SOURCE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="card card-warm" style={{ marginBottom: 'var(--s-4)', padding: 'var(--s-4)' }}>
        <span className="eyebrow">Filtered total</span>
        <div className="page-title" style={{ fontSize: 24 }}>{formatGhs(totals)}</div>
      </div>

      <AsyncList state={journal} loadingLabel="Loading journal..." emptyTitle="No journal entries">
        {(rows) => (
          <div className="dtable-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Date</th>
                  <th style={{ width: 140 }}>Entry no.</th>
                  <th>Memo</th>
                  <th style={{ width: 120 }}>Source</th>
                  <th className="num" style={{ width: 130 }}>Total</th>
                  <th style={{ width: 180 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((j) => (
                  <tr key={j.id} onClick={() => navigate(`/accounting/journal/${j.id}`)}>
                    <td className="mono">{formatDate(j.entry_date)}</td>
                    <td className="mono">{j.entry_no}</td>
                    <td>{j.memo || <span className="faint">--</span>}</td>
                    <td>{JOURNAL_ORIGIN_LABELS[j.origin]} · {JOURNAL_SOURCE_TYPE_LABELS[j.source_type]}</td>
                    <td className="num">{formatGhs(j.lines.reduce((sum, l) => sum + l.debit_pesewas, 0))}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <SplitButton
                        size="sm"
                        onClick={() => navigate(`/accounting/journal/${j.id}`)}
                        menu={(
                          <>
                            <Dropdown.Item onSelect={() => navigate(`/accounting/journal/${j.id}`)}>View</Dropdown.Item>
                            {j.status !== 'void' && <Dropdown.Item onSelect={() => setVoidingId(j.id)}>Void by reversal</Dropdown.Item>}
                          </>
                        )}
                      >
                        View
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
