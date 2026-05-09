import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { api } from '../../lib/api';
import { formatGhs } from '../../lib/format';
import { paths } from '../../router/paths';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { Spinner } from '../../components/Spinner';
import type { Item, ItemKind, ItemStatus } from '@shared/schemas';

const KIND_OPTIONS: ReadonlyArray<{ value: ItemKind | 'all'; label: string }> = [
  { value: 'all', label: 'All lines' },
  { value: 'party_supply', label: 'Party supplies' },
  { value: 'hearse', label: 'Hearses' },
];

const STATUS_OPTIONS: ReadonlyArray<{ value: ItemStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'retired', label: 'Retired' },
];

export default function CatalogList(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const search = searchParams.get('q') ?? '';
  const kind = (searchParams.get('kind') ?? 'all') as ItemKind | 'all';
  const status = (searchParams.get('status') ?? 'all') as ItemStatus | 'all';

  // Use the URL value as the input value's "key" so back/forward syncs the field.
  const [draft, setDraft] = useState(search);

  const filter = useMemo(
    () => ({
      ...(search ? { search } : {}),
      ...(kind !== 'all' ? { kind: kind as ItemKind } : {}),
      ...(status !== 'all' ? { status: status as ItemStatus } : {}),
    }),
    [search, kind, status],
  );

  const items = useAsync(() => api.catalog.list(filter), [search, kind, status]);

  function setParam(name: string, value: string): void {
    const next = new URLSearchParams(searchParams);
    if (value === '' || value === 'all') next.delete(name);
    else next.set(name, value);
    setSearchParams(next, { replace: true });
  }

  function submitSearch(e: React.FormEvent): void {
    e.preventDefault();
    setParam('q', draft.trim());
  }

  return (
    <div className="page fade-up">
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Operations · Inventory</div>
          <h1 className="page-title">Catalog</h1>
          <p className="muted" style={{ marginTop: 8, maxWidth: 540 }}>
            Everything Donkor & Sons rents — from chairs and tents to hearses. Add, edit, retire.
          </p>
        </div>
        <div className="page-actions">
          <Link to={paths.catalog.new}><Button variant="primary">+ New item</Button></Link>
        </div>
      </header>

      <form key={search} className="page-toolbar fade-up fade-up-1" onSubmit={submitSearch}>
        <input
          className="input"
          style={{ flex: '1 1 0', minWidth: 0 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search by name or SKU…"
          aria-label="Search catalog"
        />
        <select
          className="select"
          style={{ width: 160 }}
          value={kind}
          onChange={(e) => setParam('kind', e.target.value)}
          aria-label="Filter by kind"
        >
          {KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          className="select"
          style={{ width: 150 }}
          value={status}
          onChange={(e) => setParam('status', e.target.value)}
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <Button type="submit">Apply</Button>
        {(search || kind !== 'all' || status !== 'all') && (
          <Button variant="ghost" type="button" onClick={() => setSearchParams({}, { replace: true })}>
            Clear
          </Button>
        )}
      </form>

      <div className="fade-up fade-up-2">
        <CatalogResults
          state={items}
          search={search}
          onItemClick={(i) => navigate(paths.catalog.detail(i.id))}
        />
      </div>
    </div>
  );
}

function CatalogResults({
  state,
  search,
  onItemClick,
}: {
  state: ReturnType<typeof useAsync<Item[]>>;
  search: string;
  onItemClick: (i: Item) => void;
}): JSX.Element {
  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className="card row" style={{ justifyContent: 'center' }}>
        <Spinner />
        <span className="muted" style={{ marginLeft: 10 }}>Reading the ledger…</span>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="card" style={{ borderColor: 'var(--bad)' }}>
        <span className="eyebrow" style={{ color: 'var(--bad)' }}>Error</span>
        <p style={{ marginTop: 6 }}>{state.error.message}</p>
      </div>
    );
  }
  if (state.data.length === 0) {
    return (
      <EmptyState
        icon={<span style={{ fontSize: 26 }}>·</span>}
        title="No items yet"
        body={search ? 'Try a different search.' : 'Register the first piece of inventory to get going.'}
        actions={<Link to={paths.catalog.new}><Button variant="primary">Add first item</Button></Link>}
      />
    );
  }
  return <ItemTable items={state.data} onClick={onItemClick} />;
}

function ItemTable({ items, onClick }: { items: Item[]; onClick: (item: Item) => void }): JSX.Element {
  return (
    <div className="dtable-wrap">
      <table className="dtable">
        <thead>
          <tr>
            <th style={{ width: 110 }}>SKU</th>
            <th>Name</th>
            <th>Line</th>
            <th>Status</th>
            <th className="num">Qty</th>
            <th className="num">Daily rate</th>
            <th className="num">Replacement</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} onClick={() => onClick(i)}>
              <td><span className="mono" style={{ color: 'var(--ink-mute)' }}>{i.sku}</span></td>
              <td>
                <div style={{ fontWeight: 500 }}>{i.name}</div>
                {i.description && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{truncate(i.description, 70)}</div>}
              </td>
              <td><KindBadge kind={i.kind} /></td>
              <td><StatusBadge status={i.status} /></td>
              <td className="num">{i.total_quantity.toLocaleString('en-GB')}</td>
              <td className="num">{formatGhs(i.daily_rate_pesewas)}</td>
              <td className="num">{formatGhs(i.replacement_value_pesewas)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KindBadge({ kind }: { kind: ItemKind }): JSX.Element {
  return kind === 'hearse'
    ? <Badge tone="info">Hearse</Badge>
    : <Badge tone="gold">Party supply</Badge>;
}

function StatusBadge({ status }: { status: ItemStatus }): JSX.Element {
  return status === 'retired'
    ? <Badge tone="neutral">Retired</Badge>
    : <Badge tone="ok" dot>Active</Badge>;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
