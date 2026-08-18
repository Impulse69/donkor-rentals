import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Input, Select, Textarea } from '../../components/Field';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { accountOptions } from './helpers';

interface FormState {
  name: string;
  phone: string;
  email: string;
  tin: string;
  address: string;
  notes: string;
  default_expense_account_id: string;
}

const blank: FormState = { name: '', phone: '', email: '', tin: '', address: '', notes: '', default_expense_account_id: '' };

export default function VendorForm(): JSX.Element {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const editing = Boolean(id);
  const existing = useAsync(() => (id ? api.vendors.get(id) : Promise.resolve(null)), [id]);
  const accounts = useAsync(() => api.accounts.list({ accountType: 'expense' }), []);
  const existingData = existing.status === 'ok' ? existing.data : null;
  const initial = useMemo<FormState>(() => {
    if (!editing || !existingData) return blank;
    const v = existingData;
    return {
      name: v.name,
      phone: v.phone ?? '',
      email: v.email ?? '',
      tin: v.tin ?? '',
      address: v.address ?? '',
      notes: v.notes ?? '',
      default_expense_account_id: v.default_expense_account_id ?? '',
    };
  }, [editing, existingData]);
  const [state, setState] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => setState(initial), [initial]);

  function set<K extends keyof FormState>(k: K, v: FormState[K]): void {
    setState((s) => ({ ...s, [k]: v }));
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!state.name.trim()) {
      toast.error('Vendor name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: state.name.trim(),
        phone: state.phone.trim() || null,
        email: state.email.trim() || null,
        tin: state.tin.trim() || null,
        address: state.address.trim() || null,
        notes: state.notes.trim() || null,
        default_expense_account_id: state.default_expense_account_id || null,
      };
      if (editing && id) {
        await api.vendors.update(id, payload);
        toast.ok('Vendor updated');
        navigate(`/expenses/vendors/${id}`);
      } else {
        const created = await api.vendors.create(payload);
        toast.ok('Vendor added');
        navigate(`/expenses/vendors/${created.id}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (editing && (existing.status === 'idle' || existing.status === 'loading')) {
    return <div className="row" style={{ justifyContent: 'center', padding: 60, color: 'var(--ink-mute)' }}><Spinner /> <span style={{ marginLeft: 10 }}>Loading vendor...</span></div>;
  }
  if (editing && existing.status === 'ok' && !existing.data) {
    return <div className="page"><EmptyState title="Vendor not found" actions={<Link to="/expenses/vendors"><Button variant="primary">Back to vendors</Button></Link>} /></div>;
  }

  return (
    <div className="page fade-up" style={{ maxWidth: 880 }}>
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Expenses · Vendors</div>
          <h1 className="page-title">{editing ? 'Edit vendor' : 'Add a vendor'}</h1>
        </div>
      </header>

      <form className="card" onSubmit={(e) => { void submit(e); }}>
        <div className="form-grid">
          <Input containerClass="full" label="Vendor name" value={state.name} onChange={(e) => set('name', e.target.value)} autoFocus />
          <Input label="Phone" mono value={state.phone} onChange={(e) => set('phone', e.target.value)} />
          <Input label="Email" type="email" value={state.email} onChange={(e) => set('email', e.target.value)} />
          <Input label="TIN" mono value={state.tin} onChange={(e) => set('tin', e.target.value)} />
          <Select
            containerClass="full"
            label="Default expense account"
            value={state.default_expense_account_id}
            onChange={(e) => set('default_expense_account_id', e.target.value)}
            options={[{ value: '', label: '-' }, ...(accounts.status === 'ok' ? accountOptions(accounts.data) : [])]}
          />
          <Textarea containerClass="full" label="Address" rows={2} value={state.address} onChange={(e) => set('address', e.target.value)} />
          <Textarea containerClass="full" label="Notes" rows={3} value={state.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>
        <div className="form-actions">
          <Link to={editing && id ? `/expenses/vendors/${id}` : '/expenses/vendors'}><Button variant="ghost" type="button">Cancel</Button></Link>
          <Button variant="primary" type="submit" loading={saving}>{editing ? 'Save changes' : 'Add vendor'}</Button>
        </div>
      </form>
    </div>
  );
}
