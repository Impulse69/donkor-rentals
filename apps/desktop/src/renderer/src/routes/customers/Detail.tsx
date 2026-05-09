import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { api } from '../../lib/api';
import { paths } from '../../router/paths';
import { Avatar } from '../../components/Avatar';
import { AuditCard } from '../../components/AuditCard';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../components/Toast';
import { CUSTOMER_ID_LABELS } from '@shared/schemas';

export default function CustomerDetail(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const customer = useAsync(() => api.customers.get(id), [id]);

  if (customer.status === 'idle' || customer.status === 'loading') {
    return <div className="row" style={{ justifyContent: 'center', padding: 60 }}><Spinner /></div>;
  }
  if (customer.status === 'error') {
    return <div className="card" style={{ borderColor: 'var(--bad)' }}>{customer.error.message}</div>;
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

  async function onDelete(): Promise<void> {
    if (!confirm(`Remove "${c.name}" from active customers? Their history stays on file.`)) return;
    try {
      await api.customers.softDelete(c.id);
      toast.ok('Customer removed');
      navigate(paths.customers.list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove');
    }
  }

  return (
    <div className="page fade-up" style={{ maxWidth: 1100 }}>
      <header className="page-head">
        <div className="row" style={{ gap: 18, alignItems: 'center' }}>
          <Avatar name={c.name} size={64} />
          <div>
            <div className="page-eyebrow">Operations · Customer</div>
            <h1 className="page-title" style={{ fontStyle: 'normal' }}>{c.name}</h1>
            <div className="muted mono" style={{ marginTop: 6, fontSize: 13 }}>
              {c.phone || c.email || 'No contact on file'}
            </div>
          </div>
        </div>
        <div className="page-actions">
          <Link to={paths.customers.edit(c.id)}><Button>Edit</Button></Link>
          <Button variant="danger" onClick={() => { void onDelete(); }}>Remove</Button>
        </div>
      </header>

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
