import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { api } from '../../lib/api';
import { formatGhs } from '../../lib/format';
import { paths } from '../../router/paths';
import { AuditCard } from '../../components/AuditCard';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { Spinner } from '../../components/Spinner';
import { Input, Select } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { EmptyState } from '../../components/EmptyState';
import { Alert } from '../../components/Alert';
import { ConfirmModal } from '../../components/Modal';
import type { ItemUnit, ItemUnitStatus } from '@shared/schemas';

export default function CatalogDetail(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const item = useAsync(() => api.catalog.get(id), [id]);
  const units = useAsync(() => api.catalog.listUnits(id), [id]);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [retiring, setRetiring] = useState(false);

  if (item.status === 'idle' || item.status === 'loading') {
    return (
      <div className="row" style={{ justifyContent: 'center', padding: 60, color: 'var(--ink-mute)' }}>
        <Spinner /> <span style={{ marginLeft: 10 }}>Loading item…</span>
      </div>
    );
  }
  if (item.status === 'error') {
    return <Alert tone="bad" eyebrow="Error" title="Could not load this item">{item.error.message}</Alert>;
  }
  if (!item.data) {
    return (
      <div className="page">
        <EmptyState
          title="Item not found"
          body="It may have been removed or never existed in this database."
          actions={<Link to={paths.catalog.list}><Button variant="primary">Back to products and services</Button></Link>}
        />
      </div>
    );
  }

  const i = item.data;
  const isHearse = i.kind === 'hearse';

  async function runRetire(): Promise<void> {
    setRetiring(true);
    try {
      await api.catalog.softDelete(i.id);
      toast.ok('Item retired');
      setConfirmRetire(false);
      navigate(paths.catalog.list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not retire');
    } finally {
      setRetiring(false);
    }
  }

  return (
    <div className="page fade-up" style={{ maxWidth: 1100 }}>
      <header className="page-head">
        <div>
          <div className="page-eyebrow">{isHearse ? 'Operations · Fleet' : 'Operations · Inventory'}</div>
          <h1 className="page-title">{i.name}</h1>
          <div className="row" style={{ marginTop: 10 }}>
            <span className="mono muted">{i.sku}</span>
            <span className="muted">·</span>
            {i.kind === 'hearse'
              ? <Badge tone="info">Hearse</Badge>
              : <Badge tone="gold">Party supply</Badge>}
            {i.status === 'retired'
              ? <Badge tone="neutral">Retired</Badge>
              : <Badge tone="ok" dot>Active</Badge>}
          </div>
        </div>
        <div className="page-actions">
          <Link to={paths.catalog.edit(i.id)}><Button>Edit</Button></Link>
          {i.status !== 'retired' && (
            <Button variant="danger" onClick={() => setConfirmRetire(true)}>Retire</Button>
          )}
        </div>
      </header>

      <ConfirmModal
        open={confirmRetire}
        onClose={() => setConfirmRetire(false)}
        onConfirm={runRetire}
        title={`Retire "${i.name}"?`}
        body="The item will be hidden from active lists but its history stays on file. You can restore it later from a retired-items view."
        confirmLabel="Retire item"
        cancelLabel="Keep active"
        tone="danger"
        loading={retiring}
      />

      <div className="detail-grid fade-up fade-up-1">
        <div className="card">
          <h3 className="card-title">Particulars</h3>
          <div className="detail-row">
            <span className="detail-key">Description</span>
            <span className="detail-val">{i.description || <span className="faint">—</span>}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Daily rate</span>
            <span className="detail-val mono">{formatGhs(i.daily_rate_pesewas)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Replacement value</span>
            <span className="detail-val mono">{formatGhs(i.replacement_value_pesewas)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">{isHearse ? 'Vehicles' : 'Quantity in pool'}</span>
            <span className="detail-val mono">{i.total_quantity.toLocaleString('en-GB')}</span>
          </div>
        </div>

        <AuditCard createdAt={i.created_at} updatedAt={i.updated_at} id={i.id} />
      </div>

      {isHearse && (
        <UnitsSection
          itemId={i.id}
          units={units.status === 'ok' ? units.data : []}
          loading={units.status === 'loading'}
          onChange={() => units.refresh()}
        />
      )}
    </div>
  );
}

function UnitsSection({
  itemId,
  units,
  loading,
  onChange,
}: {
  itemId: string;
  units: ItemUnit[];
  loading: boolean;
  onChange: () => void;
}): JSX.Element {
  const toast = useToast();
  const [adding, setAdding] = useState(false);

  return (
    <section className="card fade-up fade-up-2">
      <div className="row-between" style={{ marginBottom: 14 }}>
        <div>
          <span className="eyebrow">Per-vehicle ledger</span>
          <h3 style={{ marginTop: 4 }}>Vehicles</h3>
        </div>
        <Button onClick={() => setAdding((v) => !v)}>{adding ? 'Cancel' : '+ Add vehicle'}</Button>
      </div>

      {adding && (
        <UnitForm
          itemId={itemId}
          onCancel={() => setAdding(false)}
          onSaved={() => { setAdding(false); onChange(); toast.ok('Vehicle added'); }}
        />
      )}

      {loading ? (
        <div className="row" style={{ justifyContent: 'center', padding: 30, color: 'var(--ink-mute)' }}>
          <Spinner /> <span style={{ marginLeft: 10 }}>Loading vehicles…</span>
        </div>
      ) : units.length === 0 ? (
        <div className="muted" style={{ padding: '8px 0' }}>
          No vehicles registered yet. Add the first hearse using the button above.
        </div>
      ) : (
        <div className="dtable-wrap" style={{ marginTop: 12 }}>
          <table className="dtable">
            <thead>
              <tr>
                <th style={{ width: 120 }}>Identifier</th>
                <th>Plate</th>
                <th>VIN</th>
                <th className="num">Odometer (km)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id}>
                  <td className="mono">{u.identifier}</td>
                  <td>{u.plate || <span className="faint">—</span>}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{u.vin || <span className="faint">—</span>}</td>
                  <td className="num">{u.odometer_km != null ? u.odometer_km.toLocaleString('en-GB') : <span className="faint">—</span>}</td>
                  <td><UnitStatusBadge status={u.current_status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function UnitStatusBadge({ status }: { status: ItemUnitStatus }): JSX.Element {
  switch (status) {
    case 'available': return <Badge tone="ok" dot>Available</Badge>;
    case 'reserved':  return <Badge tone="info">Reserved</Badge>;
    case 'out':       return <Badge tone="warn">Out</Badge>;
    case 'returned':  return <Badge tone="neutral">Returned</Badge>;
    case 'damaged':   return <Badge tone="bad">Damaged</Badge>;
    case 'retired':   return <Badge tone="neutral">Retired</Badge>;
  }
}

function UnitForm({
  itemId,
  onCancel,
  onSaved,
}: {
  itemId: string;
  onCancel: () => void;
  onSaved: () => void;
}): JSX.Element {
  const toast = useToast();
  const [identifier, setIdentifier] = useState('');
  const [plate, setPlate] = useState('');
  const [vin, setVin] = useState('');
  const [odometer, setOdometer] = useState('');
  const [status, setStatus] = useState<ItemUnitStatus>('available');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!identifier.trim()) return;
    setSaving(true);
    try {
      await api.catalog.createUnit(itemId, {
        identifier: identifier.trim(),
        plate: plate.trim() || null,
        vin: vin.trim() || null,
        odometer_km: odometer ? Number.parseInt(odometer.replace(/[^\d]/g, ''), 10) : null,
        current_status: status,
        notes: null,
      });
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save vehicle');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => { void submit(e); }} className="card" style={{ marginBottom: 12, background: 'var(--panel-warm, var(--panel))' }}>
      <div className="form-grid">
        <Input
          label="Internal identifier"
          mono
          placeholder="e.g. HRS-01"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value.toUpperCase())}
          required
        />
        <Input label="Plate" placeholder="e.g. GR 1234-22" value={plate} onChange={(e) => setPlate(e.target.value)} />
        <Input label="VIN" mono placeholder="17-char VIN" value={vin} onChange={(e) => setVin(e.target.value)} />
        <Input label="Odometer (km)" mono inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value.replace(/[^\d]/g, ''))} />
        <Select
          label="Current status"
          value={status}
          onChange={(e) => setStatus(e.target.value as ItemUnitStatus)}
          options={[
            { value: 'available', label: 'Available' },
            { value: 'reserved',  label: 'Reserved' },
            { value: 'out',       label: 'Out' },
            { value: 'returned',  label: 'Returned' },
            { value: 'damaged',   label: 'Damaged' },
            { value: 'retired',   label: 'Retired' },
          ]}
        />
      </div>
      <div className="form-actions">
        <Button variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" type="submit" loading={saving}>Add vehicle</Button>
      </div>
    </form>
  );
}
