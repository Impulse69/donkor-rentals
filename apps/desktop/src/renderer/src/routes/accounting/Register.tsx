import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Alert } from '../../components/Alert';
import { AsyncList } from '../../components/AsyncList';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Spinner } from '../../components/Spinner';
import { api } from '../../lib/api';
import { formatDate, formatGhs } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { monthStartInput, todayInput } from './helpers';

export default function AccountRegister(): JSX.Element {
  const { id = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  // As in JournalList: show what was typed, query with something valid. Here an
  // emptied field previously reached the query as "", which the IPC layer
  // rejects outright — so clearing a date replaced the register with an error.
  const startInput = searchParams.get('start') ?? monthStartInput();
  const endInput = searchParams.get('end') ?? todayInput();
  const start = startInput || monthStartInput();
  const end = endInput || todayInput();
  const account = useAsync(() => api.accounts.get(id), [id]);
  const ledger = useAsync(() => api.reports.generalLedger(start, end, id), [start, end, id]);

  function setRange(name: 'start' | 'end', value: string): void {
    const next = new URLSearchParams(searchParams);
    next.set(name, value);
    setSearchParams(next, { replace: true });
  }

  if (account.status === 'idle' || account.status === 'loading') {
    return <div className="row" style={{ justifyContent: 'center', padding: 60 }}><Spinner /></div>;
  }
  if (account.status === 'error') {
    return <Alert tone="bad" eyebrow="Error" title="Could not load account">{account.error.message}</Alert>;
  }
  if (!account.data) {
    return <div className="page"><EmptyState title="Account not found" actions={<Link to="/accounting/chart"><Button>Back to chart</Button></Link>} /></div>;
  }

  return (
    <div className="page fade-up">
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Accounting / Register</div>
          <h1 className="page-title">{account.data.name}</h1>
          <div className="muted mono" style={{ marginTop: 6 }}>{account.data.code}</div>
        </div>
        <div className="page-actions">
          <Link to="/accounting/chart"><Button variant="ghost">Back to chart</Button></Link>
        </div>
      </header>

      <div className="dtable-toolbar">
        <input className="input" type="date" value={startInput} onChange={(e) => setRange('start', e.target.value)} aria-label="Start date" />
        <input className="input" type="date" value={endInput} onChange={(e) => setRange('end', e.target.value)} aria-label="End date" />
      </div>

      <AsyncList state={ledger} loadingLabel="Loading register..." emptyTitle="No register activity">
        {(rows) => (
          <div className="dtable-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Date</th>
                  <th style={{ width: 150 }}>Transaction type</th>
                  <th style={{ width: 150 }}>Name</th>
                  <th>Memo</th>
                  <th className="num" style={{ width: 120 }}>Debit</th>
                  <th className="num" style={{ width: 120 }}>Credit</th>
                  <th className="num" style={{ width: 140 }}>Running balance</th>
                </tr>
              </thead>
              {/* A register line is a single ledger posting with nothing further to
                open, so rows override the pointer cursor .dtable paints by default —
                a cursor that promises a click it cannot deliver is the defect. */}
            <tbody>
                {rows.map((r) => (
                  <tr key={r.line_id} style={{ cursor: 'default' }}>
                    <td className="mono">{formatDate(r.entry_date)}</td>
                    <td>{r.entry_no.startsWith('JE') ? 'Journal entry' : 'Transaction'}</td>
                    <td className="mono">{r.entry_no}</td>
                    <td>{r.memo || <span className="faint">--</span>}</td>
                    <td className="num">{r.debit_pesewas ? formatGhs(r.debit_pesewas) : <span className="faint">--</span>}</td>
                    <td className="num">{r.credit_pesewas ? formatGhs(r.credit_pesewas) : <span className="faint">--</span>}</td>
                    <td className="num">{formatGhs(r.running_balance_pesewas)}</td>
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
