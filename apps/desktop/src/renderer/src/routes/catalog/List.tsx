import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { api } from '../../lib/api';
import { formatGhs } from '../../lib/format';
import { paths } from '../../router/paths';
import { Button, SplitButton } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { Dropdown } from '../../components/Dropdown';
import { AsyncList } from '../../components/AsyncList';
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
          <div className="page-eyebrow">Operations / Inventory</div>
          <h1 className="page-title">Products and Services</h1>
          <p className="muted" style={{ marginTop: 8, maxWidth: 540 }}>
            Everything Donkor & Sons rents, from chairs and tents to hearses. Add, edit, retire.
          </p>
        </div>
        <div className="page-actions">
          <Link to={paths.catalog.new}><Button variant="primary">New product or service</Button></Link>
        </div>
      </header>

      <form key={search} className="dtable-toolbar fade-up fade-up-1" onSubmit={submitSearch}>
        <input
          className="input"
          style={{ flex: '1 1 0', minWidth: 0 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search by name or SKU..."
          aria-label="Search products and services"
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
          <Button variant="ghost" type="button" onClick={() => { setDraft(''); setSearchParams({}, { replace: true }); }}>
            Clear
          </Button>
        )}
      </form>

      <div className="fade-up fade-up-2">
        <AsyncList
          state={items}
          loadingLabel="Reading the ledger..."
          emptyTitle="No items yet"
          emptyBody={search ? 'Try a different search.' : 'Register the first piece of inventory to get going.'}
          emptyAction={<Link to={paths.catalog.new}><Button variant="primary">Add first item</Button></Link>}
        >
          {(rows) => (
            <ItemTable items={rows} onClick={(i) => navigate(paths.catalog.detail(i.id))} />
          )}
        </AsyncList>
      </div>
    </div>
  );
}

function ItemTable({ items, onClick }: { items: Item[]; onClick: (item: Item) => void }): JSX.Element {
  const navigate = useNavigate();
  return (
    <div className="dtable-wrap">
      <table className="dtable">
        <thead>
          <tr>
            <th>Name</th>
            <th style={{ width: 120 }}>SKU</th>
            <th style={{ width: 140 }}>Type</th>
            <th>Description</th>
            <th className="num" style={{ width: 130 }}>Sales price</th>
            <th className="num" style={{ width: 120 }}>Qty on hand</th>
            <th style={{ width: 170 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr
              key={i.id}
              role="button"
              tabIndex={0}
              onClick={() => onClick(i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onClick(i);
                }
              }}
            >
              <td>
                <div style={{ fontWeight: 500 }}>{i.name}</div>
                {i.status === 'retired' && <Badge tone="neutral">Retired</Badge>}
              </td>
              <td><span className="mono" style={{ color: 'var(--ink-mute)' }}>{i.sku}</span></td>
              <td><KindBadge kind={i.kind} /></td>
              <td>{i.description ? truncate(i.description, 80) : <span className="faint">--</span>}</td>
              <td className="num">{formatGhs(i.daily_rate_pesewas)}</td>
              <td className="num">{i.total_quantity.toLocaleString('en-GB')}</td>
              <td onClick={(e) => e.stopPropagation()}>
                <SplitButton
                  size="sm"
                  onClick={() => navigate(paths.catalog.edit(i.id))}
                  menu={
                    <>
                      <Dropdown.Item onSelect={() => navigate(paths.catalog.detail(i.id))}>
                        View
                      </Dropdown.Item>
                      {i.status !== 'retired' && (
                        <Dropdown.Item onSelect={() => navigate(paths.catalog.detail(i.id))}>
                          Retire
                        </Dropdown.Item>
                      )}
                    </>
                  }
                >
                  Edit
                </SplitButton>
              </td>
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

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}...` : s;
}
