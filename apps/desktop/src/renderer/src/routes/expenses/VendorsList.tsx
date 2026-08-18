import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { AsyncList } from '../../components/AsyncList';
import { Button, SplitButton } from '../../components/Button';
import { Dropdown } from '../../components/Dropdown';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';

export default function VendorsList(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const search = searchParams.get('q') ?? '';
  const [draft, setDraft] = useState(search);
  const vendors = useAsync(() => api.vendors.list(search ? { search } : {}), [search]);

  function setQ(v: string): void {
    const next = new URLSearchParams(searchParams);
    if (v.trim()) next.set('q', v.trim());
    else next.delete('q');
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="page fade-up">
      <header className="page-head">
        <div><h1 className="page-title">Vendors</h1></div>
        <div className="page-actions"><Link to="/expenses/vendors/new"><Button variant="primary">New vendor</Button></Link></div>
      </header>

      <form key={search} className="dtable-toolbar fade-up fade-up-1" onSubmit={(e) => { e.preventDefault(); setQ(draft); }}>
        <input className="input" style={{ flex: '1 1 0', minWidth: 0 }} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search by name, phone, email, or TIN..." aria-label="Search vendors" />
        <Button type="submit">Apply</Button>
        {search && <Button variant="ghost" type="button" onClick={() => setQ('')}>Clear</Button>}
      </form>

      <div className="fade-up fade-up-2">
        <AsyncList
          state={vendors}
          emptyTitle="No vendors on file"
          emptyBody={search ? `Nothing matches "${search}". Try a different vendor detail.` : 'Add a vendor before recording expenses and bills.'}
          emptyAction={<Link to="/expenses/vendors/new"><Button variant="primary">Add first vendor</Button></Link>}
        >
          {(rows) => (
            <div className="dtable-wrap">
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th style={{ width: 150 }}>Phone</th>
                    <th style={{ width: 210 }}>Email</th>
                    <th style={{ width: 170 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => (
                    <tr key={v.id} onClick={() => navigate(`/expenses/vendors/${v.id}`)}>
                      <td><span className="cell-lead"><Avatar name={v.name} size={28} /><span style={{ fontWeight: 500 }}>{v.name}</span></span></td>
                      <td>{v.phone || <span className="faint">--</span>}</td>
                      <td>{v.email || <span className="faint">--</span>}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <SplitButton
                          size="sm"
                          onClick={() => navigate('/expenses/new')}
                          menu={(
                            <>
                              <Dropdown.Item onSelect={() => navigate(`/expenses/vendors/${v.id}`)}>View</Dropdown.Item>
                              <Dropdown.Item onSelect={() => navigate(`/expenses/vendors/${v.id}/edit`)}>Edit</Dropdown.Item>
                            </>
                          )}
                        >
                          New expense
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
