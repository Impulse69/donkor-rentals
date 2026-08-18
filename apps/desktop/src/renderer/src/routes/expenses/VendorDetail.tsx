import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert } from '../../components/Alert';
import { AuditCard } from '../../components/AuditCard';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ConfirmModal } from '../../components/Modal';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { accountName } from './helpers';

export default function VendorDetail(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const vendor = useAsync(() => api.vendors.get(id), [id]);
  const accounts = useAsync(() => api.accounts.list({}), []);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function runRemove(): Promise<void> {
    setRemoving(true);
    try {
      await api.vendors.softDelete(id);
      toast.ok('Vendor removed');
      navigate('/expenses/vendors');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove vendor');
    } finally {
      setRemoving(false);
    }
  }

  if (vendor.status === 'idle' || vendor.status === 'loading') {
    return <div className="row" style={{ justifyContent: 'center', padding: 60, color: 'var(--ink-mute)' }}><Spinner /> <span style={{ marginLeft: 10 }}>Loading vendor...</span></div>;
  }
  if (vendor.status === 'error') {
    return <Alert tone="bad" eyebrow="Error" title="Could not load this vendor">{vendor.error.message}</Alert>;
  }
  if (!vendor.data) {
    return <div className="page"><EmptyState title="Vendor not found" actions={<Link to="/expenses/vendors"><Button variant="primary">Back to vendors</Button></Link>} /></div>;
  }

  const v = vendor.data;
  const accountLabel = accounts.status === 'ok' ? accountName(accounts.data, v.default_expense_account_id) : 'Loading...';

  return (
    <div className="page fade-up" style={{ maxWidth: 1100 }}>
      <header className="page-head">
        <div className="row" style={{ gap: 18, alignItems: 'center' }}>
          <Avatar name={v.name} size={64} />
          <div>
            <div className="page-eyebrow">Expenses · Vendor</div>
            <h1 className="page-title">{v.name}</h1>
            <div className="muted mono" style={{ marginTop: 6, fontSize: 13 }}>{v.phone || v.email || 'No contact on file'}</div>
          </div>
        </div>
        <div className="page-actions">
          <Link to={`/expenses/vendors/${v.id}/edit`}><Button>Edit</Button></Link>
          <Button variant="danger" onClick={() => setConfirmRemove(true)}>Remove</Button>
        </div>
      </header>

      <ConfirmModal
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={runRemove}
        title={`Remove ${v.name}?`}
        body="They will be hidden from active vendor lists, but existing expenses and bills stay on file."
        confirmLabel="Remove vendor"
        cancelLabel="Keep on file"
        tone="danger"
        loading={removing}
      />

      <div className="detail-grid fade-up fade-up-1">
        <div className="card">
          <h3 className="card-title">Contact</h3>
          <div className="detail-row"><span className="detail-key">Phone</span><span className="detail-val mono">{v.phone || <span className="faint">-</span>}</span></div>
          <div className="detail-row"><span className="detail-key">Email</span><span className="detail-val">{v.email || <span className="faint">-</span>}</span></div>
          <div className="detail-row"><span className="detail-key">TIN</span><span className="detail-val mono">{v.tin || <span className="faint">-</span>}</span></div>
          <div className="detail-row"><span className="detail-key">Address</span><span className="detail-val" style={{ whiteSpace: 'pre-wrap' }}>{v.address || <span className="faint">-</span>}</span></div>
          <h3 className="card-title" style={{ marginTop: 'var(--s-6)' }}>Accounting</h3>
          <div className="detail-row"><span className="detail-key">Default expense account</span><span className="detail-val">{accountLabel}</span></div>
          {v.notes && <p className="muted" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55, marginTop: 'var(--s-5)' }}>{v.notes}</p>}
        </div>
        <AuditCard createdLabel="First added" createdAt={v.created_at} updatedAt={v.updated_at} id={v.id} />
      </div>
    </div>
  );
}
