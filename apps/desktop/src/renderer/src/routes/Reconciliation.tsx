import { useState } from 'react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Alert } from '../components/Alert';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { KV } from '../components/KV';
import { formatDateTime } from '../lib/format';
import { useToast } from '../components/Toast';

export default function Reconciliation(): JSX.Element {
  const toast = useToast();
  const status = useAsync(() => api.sync.status(), []);
  const conflicts = useAsync(() => api.sync.listConflicts(), []);
  const [busy, setBusy] = useState(false);

  async function runSync(): Promise<void> {
    setBusy(true);
    try {
      await api.sync.retryFailed();
      await api.sync.drain();
      await api.sync.applyInbox();
      toast.ok('Reconciliation pass finished');
      status.refresh();
      conflicts.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reconciliation failed');
    } finally {
      setBusy(false);
    }
  }

  async function resolve(id: string, resolution: 'local' | 'remote'): Promise<void> {
    try {
      await api.sync.resolveConflict(id, resolution);
      toast.ok('Conflict resolved');
      conflicts.refresh();
      status.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not resolve conflict');
    }
  }

  if (status.status === 'error') return <Alert tone="bad" eyebrow="Sync">{status.error.message}</Alert>;

  const sync = status.status === 'ok' ? status.data : null;
  const rows = conflicts.status === 'ok' ? conflicts.data : [];
  const open = rows.filter((r) => r.status === 'open');

  return (
    <div className="page fade-up" style={{ maxWidth: 1180 }}>
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Admin · Sync</div>
          <h1 className="page-title" style={{ fontStyle: 'normal' }}>Reconciliation</h1>
          <p className="muted" style={{ maxWidth: 660, marginTop: 8 }}>
            Review outbox health and resolve equal-timestamp edits before they reach staff workflows.
          </p>
        </div>
        <div className="page-actions">
          <Button variant="primary" onClick={() => { void runSync(); }} loading={busy}>Run pass</Button>
        </div>
      </header>

      <section className="grid-3 fade-up fade-up-1">
        <div className="card">
          <KV label="Mode" value={sync?.configured ? 'Cloud sync' : 'Local only'} />
        </div>
        <div className="card">
          <KV label="Pending outbox" value={String(sync?.pending ?? 0)} />
        </div>
        <div className="card">
          <KV label="Open conflicts" value={String(open.length)} />
        </div>
      </section>

      {sync?.lastError && <Alert tone="bad" eyebrow="Last sync error">{sync.lastError}</Alert>}

      <section className="card fade-up fade-up-2">
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h3 className="card-title" style={{ margin: 0 }}>Conflicts</h3>
          {conflicts.status === 'loading' && <Spinner />}
        </div>

        {rows.length === 0 ? (
          <EmptyState title="No conflicts" body="Equal-timestamp edits will appear here for manager review." />
        ) : (
          <div className="dtable-wrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Table</th>
                  <th>Record</th>
                  <th>When</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} style={{ cursor: 'default' }}>
                    <td>{row.table_name}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{row.record_id.slice(0, 8)}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{formatDateTime(row.created_at)}</td>
                    <td>
                      <Badge tone={row.status === 'open' ? 'warn' : 'ok'}>{row.status.replace('_', ' ')}</Badge>
                    </td>
                    <td>
                      {row.status === 'open' && (
                        <div className="row" style={{ justifyContent: 'flex-end' }}>
                          <Button size="sm" onClick={() => { void resolve(row.id, 'local'); }}>Keep local</Button>
                          <Button size="sm" variant="primary" onClick={() => { void resolve(row.id, 'remote'); }}>
                            Use remote
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
