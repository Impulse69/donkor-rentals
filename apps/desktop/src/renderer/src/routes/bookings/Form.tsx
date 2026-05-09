import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { api } from '../../lib/api';
import { paths } from '../../router/paths';
import { Input, Select, Textarea } from '../../components/Field';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { Badge } from '../../components/Badge';
import { Alert } from '../../components/Alert';
import { useToast } from '../../components/Toast';
import { formatGhs, formatPesewasPlain, parseCedisToPesewas, formatDate } from '../../lib/format';
import {
  BOOKING_STATUS_LABELS,
  type BookingLineCreateInput,
  type ConflictReport,
  type Item,
  type ItemUnit,
} from '@shared/schemas';
import { dateInputToIso, localDateInput, daysCovered } from './helpers';

interface DraftLine {
  key: string;            // local id, used for React keys
  item_id: string;
  item_unit_id: string | null;
  quantity: number;
  daily_rate_pesewas: number;
}

export default function BookingForm(): JSX.Element {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();

  const customers = useAsync(() => api.customers.list({}), []);
  const items = useAsync(() => api.catalog.list({ status: 'active' }), []);
  const existing = useAsync(() => (id ? api.bookings.get(id) : Promise.resolve(null)), [id]);

  // ---- form state -----------------------------------------------------------

  const today = new Date();
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);

  const [customerId, setCustomerId] = useState('');
  const [startDate, setStartDate] = useState(localDateInput(today.toISOString()));
  const [endDate, setEndDate] = useState(localDateInput(tomorrow.toISOString()));
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [driver, setDriver] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);

  // Hydrate from existing on edit.
  useEffect(() => {
    if (!editing || existing.status !== 'ok' || !existing.data) return;
    const e = existing.data;
    setCustomerId(e.customer_id);
    setStartDate(localDateInput(e.starts_at));
    setEndDate(localDateInput(e.ends_at));
    setPickup(e.pickup_location ?? '');
    setDropoff(e.dropoff_location ?? '');
    setDriver(e.driver_name ?? '');
    setNotes(e.notes ?? '');
    setLines(
      e.lines.map((l) => ({
        key: l.id,
        item_id: l.item_id,
        item_unit_id: l.item_unit_id,
        quantity: l.quantity,
        daily_rate_pesewas: l.daily_rate_pesewas,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, existing.status, existing.status === 'ok' ? existing.data?.id : null]);

  // ---- derived --------------------------------------------------------------

  const startsIso = useMemo(() => dateInputToIso(startDate, '08:00'), [startDate]);
  const endsIso = useMemo(() => dateInputToIso(endDate, '18:00'), [endDate]);
  const days = daysCovered(startsIso, endsIso);
  const subtotal = lines.reduce((sum, l) => sum + l.daily_rate_pesewas * l.quantity * days, 0);

  const itemsById = useMemo(() => {
    if (items.status !== 'ok') return new Map<string, Item>();
    return new Map(items.data.map((i) => [i.id, i]));
  }, [items]);

  // ---- live conflict checking -----------------------------------------------

  const [conflicts, setConflicts] = useState<ConflictReport[] | null>(null);
  const [conflictBusy, setConflictBusy] = useState(false);

  // A stable signature keeps the effect from refiring on unrelated re-renders
  // and lets us depend on a primitive instead of an array reference.
  const linesSignature = useMemo(
    () => lines.map((l) => `${l.item_id}|${l.item_unit_id ?? ''}|${l.quantity}`).join(','),
    [lines],
  );

  useEffect(() => {
    if (lines.length === 0) { setConflicts(null); setConflictBusy(false); return; }
    if (new Date(startsIso) >= new Date(endsIso)) { setConflicts(null); setConflictBusy(false); return; }
    let cancelled = false;
    setConflictBusy(true);
    const handle = setTimeout(() => {
      api.bookings
        .checkConflicts({
          starts_at: startsIso,
          ends_at: endsIso,
          ...(editing && id ? { excludeBookingId: id } : {}),
          lines: lines.map((l) => ({
            item_id: l.item_id,
            item_unit_id: l.item_unit_id,
            quantity: l.quantity,
          })),
        })
        .then((r) => { if (!cancelled) setConflicts(r); })
        .catch(() => { if (!cancelled) setConflicts(null); })
        .finally(() => { if (!cancelled) setConflictBusy(false); });
    }, 220);
    return () => { cancelled = true; clearTimeout(handle); };
    // linesSignature captures the only fields the IPC body cares about.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startsIso, endsIso, linesSignature, editing, id]);

  const hasBlockingConflict = (conflicts ?? []).some((r) => r.available < r.requested);

  // ---- mutators -------------------------------------------------------------

  function addLineFor(itemId: string): void {
    const item = itemsById.get(itemId);
    if (!item) return;
    setLines((cur) => [
      ...cur,
      {
        key: `${itemId}-${Date.now()}`,
        item_id: item.id,
        item_unit_id: null,
        quantity: 1,
        daily_rate_pesewas: item.daily_rate_pesewas,
      },
    ]);
  }
  function removeLine(key: string): void {
    setLines((cur) => cur.filter((l) => l.key !== key));
  }
  function patchLine(key: string, patch: Partial<DraftLine>): void {
    setLines((cur) => cur.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  // ---- submit ---------------------------------------------------------------

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!customerId) { toast.error('Pick a customer'); return; }
    if (lines.length === 0) { toast.error('Add at least one line'); return; }
    if (new Date(startsIso) >= new Date(endsIso)) { toast.error('End date must be after start'); return; }
    setSaving(true);
    try {
      if (editing && id) {
        await api.bookings.update(id, {
          customer_id: customerId,
          starts_at: startsIso,
          ends_at: endsIso,
          pickup_location: pickup || null,
          dropoff_location: dropoff || null,
          driver_name: driver || null,
          notes: notes || null,
        });
        toast.ok('Booking updated');
        navigate(paths.bookings.detail(id));
      } else {
        const lineInputs: BookingLineCreateInput[] = lines.map((l) => ({
          item_id: l.item_id,
          item_unit_id: l.item_unit_id,
          quantity: l.quantity,
          daily_rate_pesewas: l.daily_rate_pesewas,
          odometer_start_km: null,
          odometer_end_km: null,
          fuel_litres_start: null,
          fuel_litres_end: null,
          notes: null,
        }));
        const created = await api.bookings.create({
          customer_id: customerId,
          starts_at: startsIso,
          ends_at: endsIso,
          pickup_location: pickup || null,
          dropoff_location: dropoff || null,
          driver_name: driver || null,
          notes: notes || null,
          status: 'quote',
          lines: lineInputs,
        });
        toast.ok('Quote saved');
        navigate(paths.bookings.detail(created.id));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // ---- render ---------------------------------------------------------------

  if (editing && (existing.status === 'idle' || existing.status === 'loading')) {
    return <div className="row" style={{ justifyContent: 'center', padding: 60 }}><Spinner /></div>;
  }
  if (editing && existing.status === 'ok' && !existing.data) {
    return (
      <div className="page">
        <p>Booking not found.</p>
        <Link to={paths.bookings.list}><Button>Back to bookings</Button></Link>
      </div>
    );
  }

  const customerOptions = customers.status === 'ok'
    ? [{ value: '', label: '— Pick a customer —' }, ...customers.data.map((c) => ({ value: c.id, label: c.name }))]
    : [{ value: '', label: 'Loading…' }];

  return (
    <div className="page fade-up" style={{ maxWidth: 1180 }}>
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Operations · Calendar</div>
          <h1 className="page-title">{editing ? 'Edit booking' : 'New booking'}</h1>
          <p className="muted" style={{ marginTop: 8, maxWidth: 540 }}>
            {editing
              ? 'Adjust the time window, customer, or operational details.'
              : 'Block off inventory for a customer over a window of dates. Conflicts surface live.'}
          </p>
        </div>
      </header>

      <form className="grid-2" style={{ gridTemplateColumns: '2fr 1fr', alignItems: 'flex-start' }}
            onSubmit={(e) => { void onSubmit(e); }}>
        <div className="card">
          <div className="form-grid">
            <Select
              containerClass="full"
              label="Customer"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              options={customerOptions}
            />
            <Input
              label="Pickup date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <Input
              label="Return date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              hint={`${days} day${days === 1 ? '' : 's'} covered`}
            />
            <Input
              label="Pickup location"
              placeholder="e.g. shop yard"
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
            />
            <Input
              label="Drop-off location"
              placeholder="e.g. event venue address"
              value={dropoff}
              onChange={(e) => setDropoff(e.target.value)}
            />
            <Input
              containerClass="full"
              label="Driver (hearse trips)"
              value={driver}
              onChange={(e) => setDriver(e.target.value)}
            />
            <Textarea
              containerClass="full"
              label="Notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {!editing && (
            <>
              <div className="divider" />
              <h3 className="card-title">Lines</h3>
              <LinePicker
                items={items.status === 'ok' ? items.data : []}
                onPick={addLineFor}
              />
              {lines.length === 0 ? (
                <p className="muted" style={{ fontStyle: 'italic', marginTop: 10 }}>
                  Pick an item above to add it to this booking.
                </p>
              ) : (
                <div style={{ marginTop: 14 }}>
                  {lines.map((l) => (
                    <LineRow
                      key={l.key}
                      line={l}
                      item={itemsById.get(l.item_id)}
                      onRemove={() => removeLine(l.key)}
                      onChange={(patch) => patchLine(l.key, patch)}
                    />
                  ))}
                  <div className="row-between" style={{ marginTop: 12, padding: '12px 4px 0', borderTop: '1px solid var(--rule)' }}>
                    <span className="muted">Subtotal — {days} day{days === 1 ? '' : 's'}</span>
                    <span className="mono" style={{ fontSize: 18 }}>{formatGhs(subtotal)}</span>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="form-actions">
            <Link to={editing && id ? paths.bookings.detail(id) : paths.bookings.list}>
              <Button variant="ghost" type="button">Cancel</Button>
            </Link>
            <Button
              variant="primary"
              type="submit"
              loading={saving}
              disabled={hasBlockingConflict || new Date(startsIso) >= new Date(endsIso)}
            >
              {editing ? 'Save changes' : 'Save quote'}
            </Button>
          </div>
        </div>

        <ConflictPanel reports={conflicts} busy={conflictBusy} editing={editing} startsIso={startsIso} endsIso={endsIso} />
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------

function LinePicker({ items, onPick }: { items: Item[]; onPick: (id: string) => void }): JSX.Element {
  const [pick, setPick] = useState('');
  return (
    <div className="row" style={{ gap: 8 }}>
      <select
        className="select"
        style={{ flex: '1 1 auto' }}
        value={pick}
        onChange={(e) => setPick(e.target.value)}
      >
        <option value="">— Add item to booking —</option>
        <optgroup label="Party supplies">
          {items.filter((i) => i.kind === 'party_supply').map((i) => (
            <option key={i.id} value={i.id}>{i.name} · {formatGhs(i.daily_rate_pesewas)}/day</option>
          ))}
        </optgroup>
        <optgroup label="Hearses">
          {items.filter((i) => i.kind === 'hearse').map((i) => (
            <option key={i.id} value={i.id}>{i.name} · {formatGhs(i.daily_rate_pesewas)}/day</option>
          ))}
        </optgroup>
      </select>
      <Button
        type="button"
        onClick={() => { if (pick) { onPick(pick); setPick(''); } }}
        disabled={!pick}
      >
        Add
      </Button>
    </div>
  );
}

function LineRow({
  line,
  item,
  onRemove,
  onChange,
}: {
  line: DraftLine;
  item: Item | undefined;
  onRemove: () => void;
  onChange: (patch: Partial<DraftLine>) => void;
}): JSX.Element {
  const units = useAsync(
    () => (item?.kind === 'hearse' ? api.catalog.listUnits(line.item_id) : Promise.resolve<ItemUnit[]>([])),
    [item?.kind, line.item_id],
  );
  const unitOptions = units.status === 'ok'
    ? [{ value: '', label: 'Any available unit' }, ...units.data.map((u) => ({ value: u.id, label: `${u.identifier}${u.plate ? ` · ${u.plate}` : ''}` }))]
    : [];

  if (!item) return <></>;

  return (
    <div
      className="card"
      style={{ padding: 'var(--s-3) var(--s-4)', marginBottom: 8, background: 'var(--panel-warm)' }}
    >
      <div className="row-between" style={{ marginBottom: 6 }}>
        <div>
          <span className="mono muted" style={{ fontSize: 12 }}>{item.sku}</span>{' '}
          <span style={{ fontWeight: 500 }}>{item.name}</span>{' '}
          {item.kind === 'hearse'
            ? <Badge tone="info">Hearse</Badge>
            : <Badge tone="gold">Party</Badge>}
        </div>
        <Button variant="ghost" size="sm" type="button" onClick={onRemove}>Remove</Button>
      </div>
      <div className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {item.kind === 'hearse' && (
          <Select
            containerClass=""
            label="Unit"
            value={line.item_unit_id ?? ''}
            onChange={(e) => onChange({ item_unit_id: e.target.value || null })}
            options={unitOptions}
          />
        )}
        <Input
          containerClass=""
          label="Quantity"
          mono
          inputMode="numeric"
          value={String(line.quantity)}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value.replace(/[^\d]/g, ''), 10) || 1;
            onChange({ quantity: Math.max(1, n) });
          }}
        />
        <Input
          containerClass=""
          label="Daily rate"
          mono
          prefix="GH₵"
          value={formatPesewasPlain(line.daily_rate_pesewas)}
          onChange={(e) => onChange({ daily_rate_pesewas: parseCedisToPesewas(e.target.value) })}
        />
      </div>
    </div>
  );
}

function ConflictPanel({
  reports,
  busy,
  editing,
  startsIso,
  endsIso,
}: {
  reports: ConflictReport[] | null;
  busy: boolean;
  editing: boolean;
  startsIso: string;
  endsIso: string;
}): JSX.Element {
  return (
    <div className="card" style={{ position: 'sticky', top: 0 }}>
      <div className="row-between">
        <span className="eyebrow">Availability</span>
        {busy && <Spinner size={12} />}
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        {formatDate(startsIso)} → {formatDate(endsIso)}
      </div>
      {!reports && (
        <p className="muted" style={{ fontStyle: 'italic', marginTop: 10 }}>
          {editing
            ? 'Adjusting time window will validate against existing inventory.'
            : 'Add lines to see real-time availability.'}
        </p>
      )}
      {reports && reports.length === 0 && (
        <p className="muted" style={{ marginTop: 10 }}>No lines yet.</p>
      )}
      {reports && reports.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {reports.map((r, i) => {
            const blocked = r.available < r.requested;
            return (
              <Alert
                key={i}
                compact
                tone={blocked ? 'bad' : 'ok'}
                title={
                  <span>
                    {r.itemName}
                    {r.unitIdentifier && <span className="mono muted" style={{ marginLeft: 6 }}> · {r.unitIdentifier}</span>}
                  </span>
                }
              >
                <div>
                  Requested <b>{r.requested}</b> ·{' '}
                  {blocked
                    ? <span style={{ color: 'var(--bad)' }}>only {Math.max(0, r.available)} free</span>
                    : `${r.available} free`}{' '}of {r.total}
                </div>
                {r.conflictingBookings.length > 0 && (
                  <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {r.conflictingBookings.map((b) => (
                      <li key={b.id} className="muted" style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                        {formatDate(b.starts_at)} → {formatDate(b.ends_at)} · {b.customer_name} · {BOOKING_STATUS_LABELS[b.status]}
                      </li>
                    ))}
                  </ul>
                )}
              </Alert>
            );
          })}
        </div>
      )}
    </div>
  );
}
