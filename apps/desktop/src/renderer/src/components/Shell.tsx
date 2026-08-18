import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { routes, resolveCrumbs, type RouteDef } from '../router/routes';
import { paths } from '../router/paths';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Dropdown } from './Dropdown';
import { ErrorBoundary } from './ErrorBoundary';
import { Spinner } from './Spinner';
import { NavIcon } from './NavIcon';
import logoUrl from '../assets/logo.png';

const NAV_SECTIONS = ['SALES', 'RENTALS', 'EXPENSES', 'ACCOUNTING', 'REPORTS', 'TAXES'] as const;
const NAV_ORDER = [
  '/',
  '/invoices',
  '/customers',
  '/bookings',
  '/catalog',
  '/returns',
  '/bookings/calendar',
  '/expenses',
  '/expenses/vendors',
  '/accounting/chart',
  '/accounting/journal',
  '/reports',
  '/taxes',
] as const;

const NEW_MENU = [
  {
    label: 'CUSTOMERS',
    entries: [
      { label: 'Invoice', to: paths.invoices.new },
      { label: 'Customer', to: paths.customers.new },
      { label: 'Booking', to: paths.bookings.new },
    ],
  },
  {
    label: 'RENTALS',
    entries: [
      { label: 'Product or service', to: paths.catalog.new },
      { label: 'Record return', to: paths.returns.list },
    ],
  },
  {
    label: 'OTHER',
    entries: [
      { label: 'Expense', to: '/expenses/new' },
      { label: 'Bill', to: '/expenses/new?kind=bill' },
      { label: 'Journal entry', to: '/accounting/journal/new' },
      { label: 'Vendor', to: '/expenses/vendors/new' },
    ],
  },
] as const;

export function Shell({ children }: { children: ReactNode }): JSX.Element {
  const location = useLocation();
  const params = useParams() as Readonly<Record<string, string>>;
  const crumbs = useMemo(() => resolveCrumbs(location.pathname, params), [location.pathname, params]);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const company = useAsync(() => api.company.getProfile(), []);

  useEffect(() => {
    if (window.donkor?.settings?.onUpdateDownloaded) {
      const unsubscribe = window.donkor.settings.onUpdateDownloaded((version: string) => {
        setUpdateVersion(version);
      });
      return unsubscribe;
    }
    return undefined;
  }, []);

  function handleRestart(): void {
    if (window.donkor?.settings?.restartAndInstall) {
      void window.donkor.settings.restartAndInstall();
    }
  }

  const navByLabel: Record<string, RouteDef[]> = NAV_SECTIONS.reduce((acc, section) => {
    acc[section] = sortNav(routes.filter((r) => r.nav && r.nav.section === section));
    return acc;
  }, {} as Record<string, RouteDef[]>);
  const primaryNav = sortNav(routes.filter((r) => r.nav && !r.nav.section));
  const companyName = company.status === 'ok' && company.data?.name ? company.data.name : 'Donkor & Sons';

  return (
    <div className="shell">
      <aside className="shell-sidebar" aria-label="Primary">
        <Mark />
        <NewMenu />
        <nav className="sidebar-nav" aria-label="Sections">
          {primaryNav.map((r) => (
            <SidebarLink key={r.path} route={r} />
          ))}
          {NAV_SECTIONS.map((section) => (
            <div key={section}>
              <div className="sidebar-section">{section}</div>
              {navByLabel[section]?.map((r) => <SidebarLink key={r.path} route={r} />)}
            </div>
          ))}
        </nav>
        {updateVersion && (
          <div className="sidebar-update" role="status">
            <span className="h">Update ready · v{updateVersion}</span>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleRestart}
              style={{ width: '100%' }}
            >
              Restart &amp; install
            </button>
          </div>
        )}
        <Foot />
      </aside>

      <header className="shell-topbar" role="banner">
        <div className="topbar-company" title={companyName}>{companyName}</div>
        <Search />
        <div className="topbar-spacer" />
        <Crumbs trail={crumbs} />
        <TopbarActions />
      </header>

      <main className="shell-main" id="main" role="main">
        <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>
      </main>
    </div>
  );
}

function sortNav(items: RouteDef[]): RouteDef[] {
  return [...items].sort((a, b) => NAV_ORDER.indexOf(a.path as typeof NAV_ORDER[number]) - NAV_ORDER.indexOf(b.path as typeof NAV_ORDER[number]));
}

function SidebarLink({ route }: { route: RouteDef }): JSX.Element {
  return (
    <NavLink
      to={route.path}
      end={route.path === '/'}
      className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
    >
      {route.nav && <NavIcon className="glyph" icon={route.nav.icon} />}
      <span>{route.nav?.label}</span>
      <span className="count" />
    </NavLink>
  );
}

function NewMenu(): JSX.Element {
  return (
    <div className="sidebar-new">
      <Dropdown
        align="start"
        portal
        trigger={<button type="button" className="new-button">+ New</button>}
      >
        <div className="new-menu" aria-label="Create new">
          {NEW_MENU.map((group) => (
            <div className="new-menu-col" key={group.label}>
              <div className="new-menu-head">{group.label}</div>
              {group.entries.map((entry) => (
                <Link key={entry.to} to={entry.to} role="menuitem" className="new-menu-item">
                  {entry.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </Dropdown>
    </div>
  );
}

function Mark(): JSX.Element {
  return (
    <Link to="/" className="sidebar-mark" aria-label="Donkor & Sons dashboard">
      <img src={logoUrl} alt="" className="mark-logo" />
      <span className="mark-stack">
        <span className="sub">Rentals</span>
      </span>
    </Link>
  );
}

function Foot(): JSX.Element {
  const [version, setVersion] = useState<string>('-');
  useEffect(() => {
    void window.donkor.getAppVersion().then(setVersion);
  }, []);
  return (
    <div className="sidebar-foot">
      <span>v{version}</span>
      <span>Local</span>
    </div>
  );
}

function Crumbs({ trail }: { trail: Array<{ to: string; label: string }> }): JSX.Element {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {trail.map((c, i) => {
        const isLast = i === trail.length - 1;
        return (
          <span key={c.to} className="row" style={{ gap: 6 }}>
            {!isLast ? <Link to={c.to}>{c.label}</Link> : <span className="current">{c.label}</span>}
            {!isLast && <span className="sep" aria-hidden>/</span>}
          </span>
        );
      })}
    </nav>
  );
}

function TopbarActions(): JSX.Element {
  const navigate = useNavigate();
  return (
    <div className="topbar-actions">
      <Dropdown
        trigger={(
          <button type="button" className="icon-button" aria-label="Settings menu" title="Settings">
            <GearIcon />
          </button>
        )}
      >
        <Dropdown.Item onSelect={() => navigate('/settings')}>Settings</Dropdown.Item>
        <Dropdown.Item onSelect={() => navigate('/settings')}>Back up company file</Dropdown.Item>
      </Dropdown>
      <button type="button" className="icon-button" aria-label="Help" title="Help">?</button>
    </div>
  );
}

function Search(): JSX.Element {
  const ref = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function onSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (q.trim().length === 0) return;
    navigate(paths.catalog.listFiltered({ search: q.trim() }));
  }

  return (
    <form className="topbar-search" onSubmit={onSubmit} role="search">
      <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>⌕</span>
      <input
        ref={ref}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search catalog, customers, bookings..."
        aria-label="Global search"
      />
      <span className="kbd" aria-hidden>Ctrl K</span>
    </form>
  );
}

function GearIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 12.7a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4Z" />
      <path d="M16 10a6 6 0 0 0-.1-1l1.3-1-1.5-2.5-1.6.6a6.5 6.5 0 0 0-1.7-1L12.2 3H7.8l-.2 2.1a6.5 6.5 0 0 0-1.7 1l-1.6-.6L2.8 8l1.3 1a5.6 5.6 0 0 0 0 2l-1.3 1 1.5 2.5 1.6-.6a6.5 6.5 0 0 0 1.7 1l.2 2.1h4.4l.2-2.1a6.5 6.5 0 0 0 1.7-1l1.6.6 1.5-2.5-1.3-1c.1-.3.1-.7.1-1Z" />
    </svg>
  );
}

export function PageLoader(): JSX.Element {
  return (
    <div className="row" style={{ justifyContent: 'center', padding: '60px 0', color: 'var(--ink-mute)' }}>
      <Spinner /> <span style={{ marginLeft: 8 }}>Loading...</span>
    </div>
  );
}
