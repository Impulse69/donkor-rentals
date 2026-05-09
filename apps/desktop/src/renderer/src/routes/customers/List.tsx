import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { api } from '../../lib/api';
import { relTime } from '../../lib/format';
import { paths } from '../../router/paths';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Spinner } from '../../components/Spinner';
import type { Customer } from '@shared/schemas';

export default function CustomersList(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const search = searchParams.get('q') ?? '';
  const [draft, setDraft] = useState(search);

  const customers = useAsync(
    () => api.customers.list(search ? { search } : {}),
    [search],
  );

  function setQ(v: string): void {
    const next = new URLSearchParams(searchParams);
    if (v.trim()) next.set('q', v.trim());
    else next.delete('q');
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="page fade-up">
      <header className="page-head">
        <div>
          <div className="page-eyebrow">Operations · Relations</div>
          <h1 className="page-title">Customers</h1>
          <p className="muted" style={{ marginTop: 8, maxWidth: 540 }}>
            People who&rsquo;ve done business with the shop. Names, phones, IDs, and notes that
            travel with every contract.
          </p>
        </div>
        <div className="page-actions">
          <Link to={paths.customers.new}><Button variant="primary">+ New customer</Button></Link>
        </div>
      </header>

      <form
        key={search}
        className="page-toolbar fade-up fade-up-1"
        onSubmit={(e) => { e.preventDefault(); setQ(draft); }}
      >
        <input
          className="input"
          style={{ flex: '1 1 0', minWidth: 0 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search by name, phone, or email…"
          aria-label="Search customers"
        />
        <Button type="submit">Apply</Button>
        {search && (
          <Button variant="ghost" type="button" onClick={() => setQ('')}>Clear</Button>
        )}
      </form>

      <div className="fade-up fade-up-2">
        <CustomerResults
          state={customers}
          search={search}
          onClick={(c) => navigate(paths.customers.detail(c.id))}
        />
      </div>
    </div>
  );
}

function CustomerResults({
  state,
  search,
  onClick,
}: {
  state: ReturnType<typeof useAsync<Customer[]>>;
  search: string;
  onClick: (c: Customer) => void;
}): JSX.Element {
  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className="card row" style={{ justifyContent: 'center' }}>
        <Spinner />
        <span className="muted" style={{ marginLeft: 10 }}>Looking through the rolodex…</span>
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
        title="No customers on file"
        body={search ? 'Nothing matches that search.' : 'Add a customer to start writing contracts against them.'}
        actions={<Link to={paths.customers.new}><Button variant="primary">Add first customer</Button></Link>}
      />
    );
  }
  return <CustomerGrid customers={state.data} onClick={onClick} />;
}

function CustomerGrid({ customers, onClick }: { customers: Customer[]; onClick: (c: Customer) => void }): JSX.Element {
  return (
    <div className="customer-grid">
      {customers.map((c) => (
        <button key={c.id} onClick={() => onClick(c)} className="card customer-card">
          <div className="row" style={{ alignItems: 'center', gap: 12 }}>
            <Avatar name={c.name} size={40} />
            <div style={{ minWidth: 0, flex: '1 1 auto' }}>
              <div className="name">{c.name}</div>
              <div className="contact">{c.phone || c.email || 'No contact on file'}</div>
            </div>
          </div>
          {c.address && <div className="addr">{truncate(c.address, 80)}</div>}
          <div className="stamp">Updated {relTime(c.updated_at)}</div>
        </button>
      ))}
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
