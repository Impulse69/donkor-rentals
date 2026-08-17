import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { api } from '../../lib/api';
import { relTime } from '../../lib/format';
import { paths } from '../../router/paths';
import { Avatar } from '../../components/Avatar';
import { AsyncList } from '../../components/AsyncList';
import { Button, SplitButton } from '../../components/Button';
import { Dropdown } from '../../components/Dropdown';

/**
 * QBO shows an "Open balance" column here. It is deliberately absent: the figure
 * would need per-customer receivables, which this screen's existing query does
 * not return, and Phase 4 is a presentation pass — adding an IPC channel for a
 * column is out of scope. It belongs with the accounting work.
 */
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
          <h1 className="page-title">Customers</h1>
        </div>
        <div className="page-actions">
          <Link to={paths.customers.new}><Button variant="primary">New customer</Button></Link>
        </div>
      </header>

      <form
        key={search}
        className="dtable-toolbar fade-up fade-up-1"
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
        <AsyncList
          state={customers}
          emptyTitle="No customers on file"
          emptyBody={search
            ? `Nothing matches "${search}". Try a different name, phone, or email.`
            : 'Add a customer to start writing contracts against them.'}
          emptyAction={<Link to={paths.customers.new}><Button variant="primary">Add first customer</Button></Link>}
        >
          {(rows) => (
            <div className="dtable-wrap">
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th style={{ width: 150 }}>Phone</th>
                    <th style={{ width: 210 }}>Email</th>
                    <th style={{ width: 140 }}>Updated</th>
                    <th style={{ width: 170 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} onClick={() => navigate(paths.customers.detail(c.id))}>
                      <td>
                        <span className="cell-lead">
                          <Avatar name={c.name} size={28} />
                          <span style={{ fontWeight: 500 }}>{c.name}</span>
                        </span>
                      </td>
                      <td>{c.phone || <span className="faint">—</span>}</td>
                      <td>{c.email || <span className="faint">—</span>}</td>
                      <td className="faint" style={{ fontSize: 13 }}>{relTime(c.updated_at)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <SplitButton
                          size="sm"
                          onClick={() => navigate(paths.customers.detail(c.id))}
                          menu={
                            <>
                              <Dropdown.Item onSelect={() => navigate(paths.customers.edit(c.id))}>
                                Edit
                              </Dropdown.Item>
                              <Dropdown.Item onSelect={() => navigate(paths.bookings.new)}>
                                New booking
                              </Dropdown.Item>
                            </>
                          }
                        >
                          View
                        </SplitButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AsyncList>
      </div>
    </div>
  );
}
