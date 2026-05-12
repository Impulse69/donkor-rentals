import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Input, Select, Textarea } from '../../components/Field';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { useAsync } from '../../lib/useAsync';
import { api } from '../../lib/api';
import { paths } from '../../router/paths';
import { CUSTOMER_ID_OPTIONS, type CustomerIdType } from '@shared/schemas';

interface FormState {
  name: string;
  phone: string;
  email: string;
  id_type: CustomerIdType | '';
  id_number: string;
  address: string;
  notes: string;
}

const blank: FormState = {
  name: '',
  phone: '',
  email: '',
  id_type: '',
  id_number: '',
  address: '',
  notes: '',
};

export default function CustomerForm(): JSX.Element {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const editing = Boolean(id);

  const existing = useAsync(() => (id ? api.customers.get(id) : Promise.resolve(null)), [id]);

  const existingData = existing.data;

  const initial: FormState = useMemo(() => {
    if (!editing) return blank;
    if (existing.status === 'ok' && existingData) {
      const c = existingData;
      return {
        name: c.name,
        phone: c.phone ?? '',
        email: c.email ?? '',
        id_type: (c.id_type ?? '') as CustomerIdType | '',
        id_number: c.id_number ?? '',
        address: c.address ?? '',
        notes: c.notes ?? '',
      };
    }
    return blank;
  }, [editing, existing.status, existingData]);

  const [state, setState] = useState<FormState>(initial);
  useEffect(() => setState(initial), [initial]);

  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);

  function set<K extends keyof FormState>(k: K, v: FormState[K]): void {
    setState((s) => ({ ...s, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  }

  function validate(): boolean {
    const next: typeof errors = {};
    if (!state.name.trim()) next.name = 'Name is required';
    if (state.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) next.email = 'Email looks off';
    if (state.id_type && !state.id_number.trim()) next.id_number = 'ID number required when type is set';
    if (state.id_number.trim() && !state.id_type) next.id_type = 'Pick the type';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        name: state.name.trim(),
        phone: state.phone.trim() || null,
        email: state.email.trim() || null,
        id_type: state.id_type || null,
        id_number: state.id_number.trim() || null,
        address: state.address.trim() || null,
        notes: state.notes.trim() || null,
      };
      if (editing && id) {
        await api.customers.update(id, payload);
        toast.ok('Customer updated');
        navigate(paths.customers.detail(id));
      } else {
        const created = await api.customers.create(payload);
        toast.ok('Customer added');
        navigate(paths.customers.detail(created.id));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (editing && (existing.status === 'idle' || existing.status === 'loading')) {
    return <div className="row" style={{ justifyContent: 'center', padding: 60 }}><Spinner /></div>;
  }
  if (editing && existing.status === 'ok' && !existing.data) {
    return (
      <div className="page">
        <p>Customer not found.</p>
        <Link to={paths.customers.list}><Button>Back to customers</Button></Link>
      </div>
    );
  }

  return (
    <div className="page fade-up" style={{ maxWidth: 880 }}>
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Operations · Relations</div>
          <h1 className="page-title">{editing ? 'Edit customer' : 'Add a customer'}</h1>
        </div>
      </header>

      <form className="card" onSubmit={(e) => { void onSubmit(e); }}>
        <div className="form-grid">
          <Input
            containerClass="full"
            label="Full name"
            placeholder="e.g. Akosua Mensah"
            value={state.name}
            onChange={(e) => set('name', e.target.value)}
            error={errors.name}
            autoFocus
          />
          <Input
            label="Phone"
            mono
            placeholder="+233 24 000 0000"
            value={state.phone}
            onChange={(e) => set('phone', e.target.value)}
          />
          <Input
            label="Email"
            type="email"
            placeholder="optional"
            value={state.email}
            onChange={(e) => set('email', e.target.value)}
            error={errors.email}
          />
          <Select
            label="ID type"
            value={state.id_type}
            onChange={(e) => set('id_type', e.target.value as CustomerIdType | '')}
            error={errors.id_type}
            options={[{ value: '', label: '—' }, ...CUSTOMER_ID_OPTIONS]}
          />
          <Input
            label="ID number"
            mono
            placeholder="e.g. GHA-123456789-0"
            value={state.id_number}
            onChange={(e) => set('id_number', e.target.value)}
            error={errors.id_number}
          />
          <Textarea
            containerClass="full"
            label="Address"
            rows={2}
            placeholder="Street, city, region"
            value={state.address}
            onChange={(e) => set('address', e.target.value)}
          />
          <Textarea
            containerClass="full"
            label="Notes"
            rows={3}
            placeholder="Anything worth remembering — preferred contact time, repeat-customer notes, …"
            value={state.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </div>

        <div className="form-actions">
          <Link to={editing && id ? paths.customers.detail(id) : paths.customers.list}>
            <Button variant="ghost" type="button">Cancel</Button>
          </Link>
          <Button variant="primary" type="submit" loading={saving}>
            {editing ? 'Save changes' : 'Add customer'}
          </Button>
        </div>
      </form>
    </div>
  );
}
