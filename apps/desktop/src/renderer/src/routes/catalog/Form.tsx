import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Input, Select, Textarea } from '../../components/Field';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../components/Toast';
import { api } from '../../lib/api';
import { parseCedisToPesewas, formatPesewasPlain } from '../../lib/format';
import { paths } from '../../router/paths';
import { useAsync } from '../../lib/useAsync';
import type { ItemKind, ItemStatus } from '@shared/schemas';

interface FormState {
  kind: ItemKind;
  sku: string;
  name: string;
  description: string;
  daily_rate: string;
  replacement_value: string;
  total_quantity: string;
  status: ItemStatus;
}

const blank: FormState = {
  kind: 'party_supply',
  sku: '',
  name: '',
  description: '',
  daily_rate: '0.00',
  replacement_value: '0.00',
  total_quantity: '1',
  status: 'active',
};

export default function CatalogForm(): JSX.Element {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const editing = Boolean(id);

  const existing = useAsync(() => (id ? api.catalog.get(id) : Promise.resolve(null)), [id]);

  const existingData = existing.data;

  const initial: FormState = useMemo(() => {
    if (!editing) return blank;
    if (existing.status === 'ok' && existingData) {
      const i = existingData;
      return {
        kind: i.kind,
        sku: i.sku,
        name: i.name,
        description: i.description ?? '',
        daily_rate: formatPesewasPlain(i.daily_rate_pesewas),
        replacement_value: formatPesewasPlain(i.replacement_value_pesewas),
        total_quantity: String(i.total_quantity),
        status: i.status,
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
    if (!state.sku.trim()) next.sku = 'SKU is required';
    else if (state.sku.length > 64) next.sku = 'Keep it under 64 characters';
    if (!state.name.trim()) next.name = 'Name is required';
    if (!/^\d+$/.test(state.total_quantity) || Number.parseInt(state.total_quantity, 10) < 0) {
      next.total_quantity = 'Whole number, zero or more';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        kind: state.kind,
        sku: state.sku.trim(),
        name: state.name.trim(),
        description: state.description.trim() ? state.description.trim() : null,
        daily_rate_pesewas: parseCedisToPesewas(state.daily_rate),
        replacement_value_pesewas: parseCedisToPesewas(state.replacement_value),
        total_quantity: Number.parseInt(state.total_quantity, 10),
        status: state.status,
      };
      if (editing && id) {
        await api.catalog.update(id, payload);
        toast.ok('Item updated');
        navigate(paths.catalog.detail(id));
      } else {
        const created = await api.catalog.create(payload);
        toast.ok('Item registered');
        navigate(paths.catalog.detail(created.id));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (editing && (existing.status === 'idle' || existing.status === 'loading')) {
    return (
      <div className="row" style={{ justifyContent: 'center', padding: 60, color: 'var(--ink-mute)' }}>
        <Spinner /> <span style={{ marginLeft: 10 }}>Loading item…</span>
      </div>
    );
  }
  if (editing && existing.status === 'ok' && !existing.data) {
    return (
      <div className="page">
        <EmptyState
          title="Item not found"
          body="It may have been retired or removed. Head back to the catalog to pick another."
          actions={<Link to={paths.catalog.list}><Button variant="primary">Back to catalog</Button></Link>}
        />
      </div>
    );
  }

  return (
    <div className="page fade-up" style={{ maxWidth: 880 }}>
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Operations · Inventory</div>
          <h1 className="page-title">{editing ? 'Edit item' : 'Register an item'}</h1>
        </div>
      </header>

      <form className="card" onSubmit={(e) => { void onSubmit(e); }}>
        <div className="form-grid">
          <Select
            label="Line"
            value={state.kind}
            onChange={(e) => set('kind', e.target.value as ItemKind)}
            options={[
              { value: 'party_supply', label: 'Party supply (chairs, tents, sound, …)' },
              { value: 'hearse', label: 'Hearse (per-vehicle tracking)' },
            ]}
          />
          <Select
            label="Status"
            value={state.status}
            onChange={(e) => set('status', e.target.value as ItemStatus)}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'retired', label: 'Retired' },
            ]}
          />
          <Input
            label="SKU"
            mono
            placeholder="e.g. CHR-WHT-01"
            value={state.sku}
            onChange={(e) => set('sku', e.target.value.toUpperCase())}
            error={errors.sku}
            hint="Internal code. Must be unique."
          />
          <Input
            label="Display name"
            placeholder="e.g. Tiffany chair, white"
            value={state.name}
            onChange={(e) => set('name', e.target.value)}
            error={errors.name}
          />
          <Textarea
            containerClass="full"
            label="Description"
            placeholder="Optional details — material, dimensions, accessories included…"
            rows={3}
            value={state.description}
            onChange={(e) => set('description', e.target.value)}
          />
          <Input
            label="Daily rate"
            mono
            inputMode="decimal"
            value={state.daily_rate}
            onChange={(e) => set('daily_rate', e.target.value)}
            prefix="GH₵"
            hint="Per item, per day."
          />
          <Input
            label="Replacement value"
            mono
            inputMode="decimal"
            value={state.replacement_value}
            onChange={(e) => set('replacement_value', e.target.value)}
            prefix="GH₵"
            hint="Used when calculating damage write-offs."
          />
          <Input
            label={state.kind === 'hearse' ? 'Number of vehicles' : 'Quantity in pool'}
            mono
            inputMode="numeric"
            value={state.total_quantity}
            onChange={(e) => set('total_quantity', e.target.value.replace(/[^\d]/g, ''))}
            error={errors.total_quantity}
          />
        </div>

        <div className="form-actions">
          <Link to={editing && id ? paths.catalog.detail(id) : paths.catalog.list}>
            <Button variant="ghost" type="button">Cancel</Button>
          </Link>
          <Button variant="primary" type="submit" loading={saving}>
            {editing ? 'Save changes' : 'Register item'}
          </Button>
        </div>
      </form>
    </div>
  );
}
