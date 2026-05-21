import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { api } from '../../lib/api';
import { paths } from '../../router/paths';
import { Avatar } from '../../components/Avatar';
import { AuditCard } from '../../components/AuditCard';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { Alert } from '../../components/Alert';
import { ConfirmModal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { CUSTOMER_ID_LABELS } from '@shared/schemas';

export default function CustomerDetail(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const customer = useAsync(() => api.customers.get(id), [id]);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  if (customer.status === 'idle' || customer.status === 'loading') {
    return (
      <div className="row" style={{ justifyContent: 'center', padding: 60, color: 'var(--ink-mute)' }}>
        <Spinner /> <span style={{ marginLeft: 10 }}>Loading customer…</span>
      </div>
    );
  }
  if (customer.status === 'error') {
    return <Alert tone="bad" eyebrow="Error" title="Could not load this customer">{customer.error.message}</Alert>;
  }
  if (!customer.data) {
    return (
      <div className="page">
        <EmptyState
          title="Customer not found"
          body="They may have been removed from the file."
          actions={<Link to={paths.customers.list}><Button variant="primary">Back to customers</Button></Link>}
        />
      </div>
    );
  }

  const c = customer.data;

  async function runRemove(): Promise<void> {
    setRemoving(true);
    try {
      await api.customers.softDelete(c.id);
      toast.ok('Customer removed');
      setConfirmRemove(false);
      navigate(paths.customers.list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove');
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="page fade-up" style={{ maxWidth: 1100 }}>
      <header className="page-head">
        <div className="row" style={{ gap: 18, alignItems: 'center' }}>
          <Avatar name={c.name} size={64} />
          <div>
            <div className="page-eyebrow">Operations · Customer</div>
            <h1 className="page-title">{c.name}</h1>
            <div className="muted mono" style={{ marginTop: 6, fontSize: 13 }}>
              {c.phone || c.email || 'No contact on file'}
            </div>
          </div>
        </div>
        <div className="page-actions">
          <Link to={paths.customers.edit(c.id)}><Button>Edit</Button></Link>
          <Button variant="danger" onClick={() => setConfirmRemove(true)}>Remove</Button>
        </div>
      </header>

      <ConfirmModal
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={runRemove}
        title={`Remove ${c.name}?`}
        body="They'll be hidden from active customer lists, but every contract, invoice, and payment in their history stays on file."
        confirmLabel="Remove customer"
        cancelLabel="Keep on file"
        tone="danger"
        loading={removing}
      />

      <div className="detail-grid fade-up fade-up-1">
        <div className="card">
          <h3 className="card-title">Contact</h3>
          <div className="detail-row">
            <span className="detail-key">Phone</span>
            <span className="detail-val mono">{c.phone || <span className="faint">—</span>}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Email</span>
            <span className="detail-val">{c.email || <span className="faint">—</span>}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Address</span>
            <span className="detail-val" style={{ whiteSpace: 'pre-wrap' }}>{c.address || <span className="faint">—</span>}</span>
          </div>

          <h3 className="card-title" style={{ marginTop: 'var(--s-6)' }}>Identification</h3>
          <div className="detail-row">
            <span className="detail-key">Type</span>
            <span className="detail-val">{c.id_type ? CUSTOMER_ID_LABELS[c.id_type] : <span className="faint">—</span>}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Number</span>
            <span className="detail-val mono">{c.id_number || <span className="faint">—</span>}</span>
          </div>

          {c.notes && (
            <>
              <h3 className="card-title" style={{ marginTop: 'var(--s-6)' }}>Notes</h3>
              <p className="muted" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{c.notes}</p>
            </>
          )}
        </div>

        <AuditCard
          createdLabel="First added"
          createdAt={c.created_at}
          updatedAt={c.updated_at}
          id={c.id}
        />
      </div>
    </div>
  );
}
