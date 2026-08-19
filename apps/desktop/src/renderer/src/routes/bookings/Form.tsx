import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { api } from '../../lib/api';
import { paths } from '../../router/paths';
import { Input, Select, Textarea } from '../../components/Field';
import { CountInput, MoneyInput } from '@renderer/components/NumericInput';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { Badge } from '../../components/Badge';
import { Alert } from '../../components/Alert';
import { useToast } from '../../components/Toast';
import { formatGhs, formatDate } from '../../lib/format';
import {
  BOOKING_STATUS_LABELS,
  type BookingLineCreateInput,
  type BookingStatus,
  type ConflictReport,
  type Item,
  type ItemUnit,
} from '@shared/schemas';
import { dateInputToIsoOrNull, localDateInput, localTimeInput, daysCovered } from './helpers';

interface DraftLine {
  key: string;
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

  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [customerMode, setCustomerMode] = useState<'saved' | 'new' | 'walkin'>('saved');
  const [customerId, setCustomerId] = useState('');
  const [renterName, setRenterName] = useState('Walk-in rental');
  const [renterPhone, setRenterPhone] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [initialStatus, setInitialStatus] = useState<BookingStatus>('reserved');
  const [startDate, setStartDate] = useState(localDateInput(today.toISOString()));
  const [startTime, setStartTime] = useState('08:00');
  const [endDate, setEndDate] = useState(localDateInput(tomorrow.toISOString()));
  const [endTime, setEndTime] = useState('18:00');
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [driver, setDriver] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);

  const existingDataId = existing.status === 'ok' ? existing.data?.id : null;
  const existingData = existing.data;

  useEffect(() => {
    if (!editing || existing.status !== 'ok' || !existingData) return;
    const e = existingData;
    setCustomerMode(e.customer_id ? 'saved' : 'walkin');
    setCustomerId(e.customer_id ?? '');
    setRenterName(e.renter_name ?? e.customer_name);
    setRenterPhone(e.renter_phone ?? '');
    setInitialStatus(e.status);
    setStartDate(localDateInput(e.starts_at));
    setStartTime(localTimeInput(e.starts_at));
    setEndDate(localDateInput(e.ends_at));
    setEndTime(localTimeInput(e.ends_at));
    setPickup(e.pickup_location ?? '');
    setDropoff(e.dropoff_location ?? '');
    setDriver(e.driver_name ?? '');
    setNotes(e.notes ?? '');
    setLines(e.lines.map((l) => ({
      key: l.id,
      item_id: l.item_id,
      item_unit_id: l.item_unit_id,
      quantity: l.quantity,
      daily_rate_pesewas: l.daily_rate_pesewas,
    })));
  }, [editing, existing.status, existingDataId, existingData]);

  // A date input is empty for as long as it takes to clear it and type a new
  // one, and dateInputToIso throws on an empty string. Called here — in render —
  // that threw the whole form into the error boundary mid-keystroke, losing
  // everything else already typed in.
  const startsIsoRaw = useMemo(() => dateInputToIsoOrNull(startDate, startTime), [startDate, startTime]);
  const endsIsoRaw = useMemo(() => dateInputToIsoOrNull(endDate, endTime), [endDate, endTime]);
  const datesValid = startsIsoRaw !== null && endsIsoRaw !== null;
  // A stable stand-in so the panel keeps rendering while a date is half-typed.
  // It must not change identity between renders or the availability check would
  // refire on every keystroke. Nothing that matters uses it: everything with a
  // consequence is gated on `datesValid`.
  const placeholder = useMemo(
    () => ({ start: new Date().toISOString(), end: new Date(Date.now() + 86_400_000).toISOString() }),
    [],
  );
  const startsIso = startsIsoRaw ?? placeholder.start;
  const endsIso = endsIsoRaw ?? placeholder.end;
  const days = daysCovered(startsIso, endsIso);

  const itemsById = useMemo(() => {
    if (items.status !== 'ok') return new Map<string, Item>();
    return new Map(items.data.map((i) => [i.id, i]));
  }, [items]);
  // Whether to SHOW the hearse fields. `itemsById` is empty until the catalogue
  // request lands, and a retired hearse never appears in it at all — so this
  // flag alone must never decide what gets SAVED (see the submit payload).
  // Keep the fields visible whenever the booking already carries any of these
  // values, or editing an old hearse booking would hide its own driver.
  const hasHearseLine =
    lines.some((l) => itemsById.get(l.item_id)?.kind === 'hearse') ||
    Boolean(pickup || dropoff || driver);
  const subtotal = lines.reduce((sum, l) => sum + l.daily_rate_pesewas * l.quantity * days, 0);

  const [conflicts, setConflicts] = useState<ConflictReport[] | null>(null);
  const [conflictBusy, setConflictBusy] = useState(false);
  const mappedLinesForConflicts = useMemo(() => {
    return lines.map((l) => ({ item_id: l.item_id, item_unit_id: l.item_unit_id, quantity: l.quantity }));
  }, [lines]);

  useEffect(() => {
    if (!datesValid || mappedLinesForConflicts.length === 0 || new Date(startsIso) >= new Date(endsIso)) {
      setConflicts(null);
      setConflictBusy(false);
      return;
    }
    let cancelled = false;
    setConflictBusy(true);
    const handle = setTimeout(() => {
      api.bookings.checkConflicts({
        starts_at: startsIso,
        ends_at: endsIso,
        ...(editing && id ? { excludeBookingId: id } : {}),
        lines: mappedLinesForConflicts,
      })
        .then((r) => { if (!cancelled) setConflicts(r); })
        .catch(() => { if (!cancelled) setConflicts(null); })
        .finally(() => { if (!cancelled) setConflictBusy(false); });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [datesValid, startsIso, endsIso, mappedLinesForConflicts, editing, id]);

  const hasBlockingConflict = (conflicts ?? []).some((r) => r.available < r.requested);

  function addLineFor(itemId: string): void {
    const item = itemsById.get(itemId);
    if (!item) return;
    setLines((cur) => [...cur, {
      key: `${itemId}-${Date.now()}`,
      item_id: item.id,
      item_unit_id: null,
      quantity: 1,
      daily_rate_pesewas: item.daily_rate_pesewas,
    }]);
  }

  function patchLine(key: string, patch: Partial<DraftLine>): void {
    setLines((cur) => cur.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (customerMode === 'saved' && !customerId) { toast.error('Pick a customer'); return; }
    if (customerMode === 'new' && !newCustomerName.trim()) { toast.error('Enter the customer name'); return; }
    if (customerMode === 'walkin' && !renterName.trim()) { toast.error('Enter a renter label'); return; }
    if (lines.length === 0) { toast.error('Add at least one line'); return; }
    if (!datesValid) { toast.error('Pick a start and an end date'); return; }
    if (new Date(startsIso) >= new Date(endsIso)) { toast.error('End date must be after start'); return; }

    setSaving(true);
    try {
      let submitCustomerId: string | null = customerMode === 'saved' ? customerId : null;
      let submitRenterName: string | null = customerMode === 'walkin' ? renterName.trim() : null;
      const submitRenterPhone: string | null =
        customerMode === 'walkin' ? renterPhone.trim() || null : null;
      if (!editing && customerMode === 'new') {
        const createdCustomer = await api.customers.create({
          name: newCustomerName.trim(),
          phone: newCustomerPhone.trim() || null,
          email: newCustomerEmail.trim() || null,
          id_type: null,
          id_number: null,
          address: null,
          notes: null,
        });
        submitCustomerId = createdCustomer.id;
        submitRenterName = createdCustomer.name;
      }

      const base = {
        customer_id: submitCustomerId,
        renter_name: submitRenterName,
        renter_phone: submitRenterPhone,
        starts_at: startsIso,
        ends_at: endsIso,
        // Save what is in the form, never what a derived flag thinks should be
        // in it. These were nulled whenever `hasHearseLine` was false — which
        // includes the moment before the catalogue has loaded and for ever
        // after the hearse is retired. Opening an old booking to change a date
        // and pressing Save silently erased the driver, pickup and drop-off.
        pickup_location: pickup || null,
        dropoff_location: dropoff || null,
        driver_name: driver || null,
        notes: notes || null,
      };

      if (editing && id) {
        await api.bookings.update(id, base);
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
        const created = await api.bookings.create({ ...base, status: initialStatus, lines: lineInputs });
        toast.ok(`${BOOKING_STATUS_LABELS[initialStatus]} saved`);
        navigate(paths.bookings.detail(created.id));
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
        <Spinner /> <span style={{ marginLeft: 10 }}>Loading booking…</span>
      </div>
    );
  }

  const customerOptions = customers.status === 'ok'
    ? [{ value: '', label: 'Pick a customer' }, ...customers.data.map((c) => ({ value: c.id, label: c.name }))]
    : [{ value: '', label: 'Loading...' }];

  return (
    <div className="page fade-up" style={{ maxWidth: 1180 }}>
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Operations · Bookings</div>
          <h1 className="page-title">{editing ? 'Edit booking' : 'New booking'}</h1>
          <p className="muted" style={{ marginTop: 8, maxWidth: 540, lineHeight: 1.55 }}>
            {editing
              ? 'Update the dates, driver, or notes. Lines are managed from the booking detail.'
              : 'Pick a renter, choose a window, then add the lines they need. Conflicts surface on the right as you go.'}
          </p>
        </div>
      </header>

      <form className="grid-2" style={{ gridTemplateColumns: '2fr 1fr', alignItems: 'flex-start' }} onSubmit={(e) => { void onSubmit(e); }}>
        <div className="card">
          <div className="form-grid">
            {!editing && (
              <Select
                label="Booking type"
                value={initialStatus}
                onChange={(e) => setInitialStatus(e.target.value as BookingStatus)}
                options={[
                  { value: 'reserved', label: 'Reserve for later' },
                  { value: 'out', label: 'Rent now' },
                  { value: 'quote', label: 'Quote only' },
                ]}
              />
            )}
            <Select
              label="Renter"
              value={customerMode}
              onChange={(e) => setCustomerMode(e.target.value as 'saved' | 'new' | 'walkin')}
              options={[
                { value: 'saved', label: 'Saved customer' },
                { value: 'new', label: 'New customer' },
                { value: 'walkin', label: 'One-time renter' },
              ]}
            />
            {customerMode === 'saved' && (
              <Select containerClass="full" label="Customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)} options={customerOptions} />
            )}
            {customerMode === 'new' && (
              <>
                <Input label="Customer name" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} required />
                <Input label="Phone" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} />
                <Input label="Email" type="email" value={newCustomerEmail} onChange={(e) => setNewCustomerEmail(e.target.value)} />
              </>
            )}
            {customerMode === 'walkin' && (
              <>
                <Input label="Renter label" value={renterName} onChange={(e) => setRenterName(e.target.value)} required />
                <Input
                  label="Phone (optional)"
                  type="tel"
                  value={renterPhone}
                  onChange={(e) => setRenterPhone(e.target.value)}
                  hint="So you can reach them about pickup or return"
                />
              </>
            )}
            <Input label="Pickup date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input label="Pickup time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <Input label="Return date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <Input label="Return time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} hint={`${days} day${days === 1 ? '' : 's'}`} />
            {hasHearseLine && (
              <>
                <Input label="Pickup location" value={pickup} onChange={(e) => setPickup(e.target.value)} />
                <Input label="Drop-off location" value={dropoff} onChange={(e) => setDropoff(e.target.value)} />
                <Input containerClass="full" label="Driver name" value={driver} onChange={(e) => setDriver(e.target.value)} />
              </>
            )}
            <Textarea containerClass="full" label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {!editing && (
            <>
              <div className="divider" />
              <h3 className="card-title">Lines</h3>
              <LinePicker
                items={items.status === 'ok' ? items.data : []}
                loading={items.status === 'loading'}
                onPick={addLineFor}
              />
              <div style={{ marginTop: 14 }}>
                {lines.map((l) => (
                  <LineRow
                    key={l.key}
                    line={l}
                    item={itemsById.get(l.item_id)}
                    onRemove={() => setLines((cur) => cur.filter((x) => x.key !== l.key))}
                    onChange={(patch) => patchLine(l.key, patch)}
                  />
                ))}
                {lines.length > 0 && (
                  <div className="row-between" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--rule)' }}>
                    <span className="muted">Subtotal - {days} day{days === 1 ? '' : 's'}</span>
                    <span className="mono" style={{ fontSize: 18 }}>{formatGhs(subtotal)}</span>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="form-actions">
            <Link to={editing && id ? paths.bookings.detail(id) : paths.bookings.list}>
              <Button variant="ghost" type="button">Cancel</Button>
            </Link>
            <Button variant="primary" type="submit" loading={saving} disabled={hasBlockingConflict || !datesValid || new Date(startsIso) >= new Date(endsIso)}>
              {editing ? 'Save changes' : BOOKING_STATUS_LABELS[initialStatus]}
            </Button>
          </div>
        </div>

        <ConflictPanel reports={conflicts} busy={conflictBusy} editing={editing} startsIso={startsIso} endsIso={endsIso} />
      </form>
    </div>
  );
}

function LinePicker({ items, loading, onPick }: {
  items: Item[];
  loading: boolean;
  onPick: (id: string) => void;
}): JSX.Element {
  const [pick, setPick] = useState('');
  const supplies = items.filter((i) => i.kind === 'party_supply');
  const hearses = items.filter((i) => i.kind === 'hearse');

  if (loading) {
    return (
      <div className="row" style={{ gap: 8 }}>
        <select className="select" style={{ flex: '1 1 auto' }} disabled>
          <option>Loading products…</option>
        </select>
        <Button type="button" disabled>Add</Button>
      </div>
    );
  }

  // A fresh install has an empty catalog, and an empty picker is indistinguishable
  // from a broken one: the optgroup labels still render as grey rows that look
  // selectable, so clicking them appears to do nothing and the booking cannot be
  // completed. Say what is wrong and where to fix it.
  if (items.length === 0) {
    return (
      <Alert tone="info" eyebrow="No products yet" title="Add a product or service before booking">
        <p style={{ margin: '4px 0 10px' }}>
          A booking is made up of items from your catalogue, and nothing has been added yet.
        </p>
        <Link to={paths.catalog.new}>
          <Button variant="primary" type="button">Add your first product</Button>
        </Link>
      </Alert>
    );
  }

  return (
    <div className="row" style={{ gap: 8 }}>
      <select
        className="select"
        style={{ flex: '1 1 auto' }}
        value={pick}
        onChange={(e) => setPick(e.target.value)}
        aria-label="Add item to booking"
      >
        <option value="">Add item to booking</option>
        {/* Only render a group that has something in it — an empty optgroup shows
            a label that looks like a choice but cannot be selected. */}
        {supplies.length > 0 && (
          <optgroup label="Party supplies">
            {supplies.map((i) => (
              <option key={i.id} value={i.id}>{i.name} - {formatGhs(i.daily_rate_pesewas)}/day</option>
            ))}
          </optgroup>
        )}
        {hearses.length > 0 && (
          <optgroup label="Hearses">
            {hearses.map((i) => (
              <option key={i.id} value={i.id}>{i.name} - {formatGhs(i.daily_rate_pesewas)}/day</option>
            ))}
          </optgroup>
        )}
      </select>
      <Button type="button" onClick={() => { if (pick) { onPick(pick); setPick(''); } }} disabled={!pick}>Add</Button>
    </div>
  );
}

function LineRow({ line, item, onRemove, onChange }: {
  line: DraftLine;
  item: Item | undefined;
  onRemove: () => void;
  onChange: (patch: Partial<DraftLine>) => void;
}): JSX.Element {
  const units = useAsync(() => (item?.kind === 'hearse' ? api.catalog.listUnits(line.item_id) : Promise.resolve<ItemUnit[]>([])), [item?.kind, line.item_id]);
  const unitOptions = units.status === 'ok'
    ? [{ value: '', label: 'Any available unit' }, ...units.data.map((u) => ({ value: u.id, label: `${u.identifier}${u.plate ? ` - ${u.plate}` : ''}` }))]
    : [{ value: '', label: 'Loading units...' }];

  if (!item) return <></>;

  return (
    <div className="card" style={{ padding: 'var(--s-3) var(--s-4)', marginBottom: 8, background: 'var(--panel-warm)' }}>
      <div className="row-between" style={{ marginBottom: 6 }}>
        <div>
          <span className="mono muted" style={{ fontSize: 12 }}>{item.sku}</span>{' '}
          <span style={{ fontWeight: 500 }}>{item.name}</span>{' '}
          <Badge tone={item.kind === 'hearse' ? 'info' : 'gold'}>{item.kind === 'hearse' ? 'Hearse' : 'Party'}</Badge>
        </div>
        <Button variant="ghost" size="sm" type="button" onClick={onRemove}>Remove</Button>
      </div>
      <div className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {item.kind === 'hearse' && (
          <Select label="Unit" value={line.item_unit_id ?? ''} onChange={(e) => onChange({ item_unit_id: e.target.value || null })} options={unitOptions} />
        )}
        <CountInput label="Quantity" min={1} value={line.quantity} onValueChange={(quantity) => onChange({ quantity })} />
        <MoneyInput label="Daily rate" value={line.daily_rate_pesewas} onValueChange={(daily_rate_pesewas) => onChange({ daily_rate_pesewas })} />
      </div>
    </div>
  );
}

function ConflictPanel({ reports, busy, editing, startsIso, endsIso }: {
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
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{formatDate(startsIso)} to {formatDate(endsIso)}</div>
      {!reports && (
        <p className="muted" style={{ fontStyle: 'italic', marginTop: 10 }}>
          {editing ? 'Adjusting dates will validate inventory.' : 'Add lines to see availability.'}
        </p>
      )}
      {reports && reports.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {reports.map((r, i) => {
            const blocked = r.available < r.requested;
            return (
              <Alert key={i} compact tone={blocked ? 'bad' : 'ok'} title={r.itemName}>
                Requested <b>{r.requested}</b> - {blocked ? `only ${Math.max(0, r.available)} free` : `${r.available} free`} of {r.total}
              </Alert>
            );
          })}
        </div>
      )}
    </div>
  );
}
