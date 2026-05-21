import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { routes, resolveCrumbs, type RouteDef } from '../router/routes';
import { paths } from '../router/paths';
import { Avatar } from './Avatar';
import { ErrorBoundary } from './ErrorBoundary';
import { Spinner } from './Spinner';
import { api } from '../lib/api';
import type { AuthSession, SyncStatus } from '@shared/schemas';
import logoUrl from '../assets/logo.png';

const NAV_SECTIONS = ['WORKSPACE', 'OPERATIONS', 'ADMIN'] as const;

export function Shell({ children }: { children: ReactNode }): JSX.Element {
  const location = useLocation();
  const params = useParams() as Readonly<Record<string, string>>;
  const crumbs = useMemo(() => resolveCrumbs(location.pathname, params), [location.pathname, params]);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);

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
    acc[section] = routes.filter((r) => r.nav && r.nav.section === section);
    return acc;
  }, {} as Record<string, RouteDef[]>);

  return (
    <div className="shell">
      <aside className="shell-sidebar" aria-label="Primary">
        <Mark />
        <nav className="sidebar-nav" aria-label="Sections">
          {NAV_SECTIONS.map((section) => (
            <div key={section}>
              <div className="sidebar-section">{section}</div>
              {navByLabel[section]?.map((r) => (
                <NavLink
                  key={r.path}
                  to={r.path}
                  end={r.path === '/'}
                  className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
                >
                  <span className="glyph" aria-hidden>{r.nav?.glyph}</span>
                  <span>{r.nav?.label}</span>
                  <span className="count" />
                </NavLink>
              ))}
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
        <Crumbs trail={crumbs} />
        <div className="topbar-spacer" />
        <Search />
        <SyncPill />
        <UserChip />
      </header>

      <main className="shell-main" id="main" role="main">
        <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>
      </main>
    </div>
  );
}

function Mark(): JSX.Element {
  return (
    <Link to="/" className="sidebar-mark" aria-label="Donkor & Sons — overview">
      <img src={logoUrl} alt="" className="mark-logo" />
      <span className="mark-stack">
        <span className="sub">Rentals</span>
      </span>
    </Link>
  );
}

function Foot(): JSX.Element {
  const [version, setVersion] = useState<string>('—');
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
        placeholder="Search catalog, customers, bookings…"
        aria-label="Global search"
      />
      <span className="kbd" aria-hidden>Ctrl K</span>
    </form>
  );
}

function SyncPill(): JSX.Element {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  useEffect(() => {
    let alive = true;
    function load(): void {
      void api.sync.status().then((next) => {
        if (alive) setStatus(next);
      });
    }
    load();
    const timer = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const label = !status
    ? 'Sync'
    : !status.configured
      ? 'Local'
      : status.failed > 0
        ? 'Sync issue'
        : status.pending > 0
          ? `${status.pending} pending`
          : 'Synced';
  const klass = status?.configured && status.failed === 0 ? 'online' : status?.failed ? 'offline' : '';

  return (
    <Link
      to="/reconciliation"
      className={`sync-pill ${klass}`}
      title={status?.lastError ?? (status?.configured ? 'Cloud sync is configured' : 'Cloud sync is not configured')}
    >
      <span className="dot" aria-hidden />
      {label}
    </Link>
  );
}

function UserChip(): JSX.Element {
  const [session, setSession] = useState<AuthSession | null>(null);
  useEffect(() => {
    let alive = true;
    void api.auth.getSession().then((next) => {
      if (alive) setSession(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  const label = session?.user.name ?? 'Setup';
  const title = session ? `${session.user.email} · ${session.user.role}` : 'Complete first-run setup';

  return (
    <Link to="/settings" className="user-chip" title={title}>
      <Avatar name={label} size={24} />
      <span>{label}</span>
    </Link>
  );
}

export function PageLoader(): JSX.Element {
  return (
    <div className="row" style={{ justifyContent: 'center', padding: '60px 0', color: 'var(--ink-mute)' }}>
      <Spinner /> <span style={{ marginLeft: 8 }}>Loading…</span>
    </div>
  );
}
