import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Route definitions. Single source of truth used by:
 *  - the `<Routes>` tree (App.tsx)
 *  - the sidebar nav (driven by `nav: true` entries)
 *  - the breadcrumb resolver (uses `crumb`)
 *
 * Keep nesting flat. Children are explicit and indexed by parent path.
 */
export interface RouteDef {
  path: string;
  element: LazyExoticComponent<ComponentType>;
  crumb: string | ((params: Readonly<Record<string, string>>) => string);
  nav?: {
    label: string;
    glyph: string; // monospace mark, e.g. '01'
    section?: string;
  };
}

const Catalog = {
  List: lazy(() => import('../routes/catalog/List')),
  Form: lazy(() => import('../routes/catalog/Form')),
  Detail: lazy(() => import('../routes/catalog/Detail')),
};

const Customers = {
  List: lazy(() => import('../routes/customers/List')),
  Form: lazy(() => import('../routes/customers/Form')),
  Detail: lazy(() => import('../routes/customers/Detail')),
};

const Bookings = {
  List: lazy(() => import('../routes/bookings/List')),
  Calendar: lazy(() => import('../routes/bookings/Calendar')),
  Form: lazy(() => import('../routes/bookings/Form')),
  Detail: lazy(() => import('../routes/bookings/Detail')),
};

const Invoices = {
  List: lazy(() => import('../routes/invoices/List')),
  New: lazy(() => import('../routes/invoices/New')),
  Detail: lazy(() => import('../routes/invoices/Detail')),
};

const Returns = {
  List: lazy(() => import('../routes/returns/List')),
  Form: lazy(() => import('../routes/returns/Form')),
};

const Reconciliation = lazy(() => import('../routes/Reconciliation'));
const Settings = lazy(() => import('../routes/Settings'));
const Reports = lazy(() => import('../routes/Reports'));
const Dashboard = lazy(() => import('../routes/Dashboard'));

export const routes: RouteDef[] = [
  {
    path: '/',
    element: Dashboard,
    crumb: 'Dashboard',
    nav: { label: 'Dashboard', glyph: '00', section: 'WORKSPACE' },
  },

  {
    path: '/catalog',
    element: Catalog.List,
    crumb: 'Catalog',
    nav: { label: 'Catalog', glyph: '01', section: 'OPERATIONS' },
  },
  { path: '/catalog/new', element: Catalog.Form, crumb: 'New item' },
  { path: '/catalog/:id', element: Catalog.Detail, crumb: 'Item' },
  { path: '/catalog/:id/edit', element: Catalog.Form, crumb: 'Edit' },

  {
    path: '/customers',
    element: Customers.List,
    crumb: 'Customers',
    nav: { label: 'Customers', glyph: '02', section: 'OPERATIONS' },
  },
  { path: '/customers/new', element: Customers.Form, crumb: 'New customer' },
  { path: '/customers/:id', element: Customers.Detail, crumb: 'Customer' },
  { path: '/customers/:id/edit', element: Customers.Form, crumb: 'Edit' },

  {
    path: '/bookings',
    element: Bookings.List,
    crumb: 'Bookings',
    nav: { label: 'Bookings', glyph: '03', section: 'OPERATIONS' },
  },
  { path: '/bookings/calendar', element: Bookings.Calendar, crumb: 'Calendar' },
  { path: '/bookings/new', element: Bookings.Form, crumb: 'New booking' },
  { path: '/bookings/:id', element: Bookings.Detail, crumb: 'Booking' },
  { path: '/bookings/:id/edit', element: Bookings.Form, crumb: 'Edit' },

  {
    path: '/invoices',
    element: Invoices.List,
    crumb: 'Invoices',
    nav: { label: 'Invoices', glyph: '04', section: 'OPERATIONS' },
  },
  { path: '/invoices/new', element: Invoices.New, crumb: 'New invoice' },
  { path: '/invoices/:id', element: Invoices.Detail, crumb: 'Invoice' },

  {
    path: '/reconciliation',
    element: Reconciliation,
    crumb: 'Reconciliation',
    // nav: { label: 'Reconciliation', glyph: '07', section: 'ADMIN' },
  },
  {
    path: '/returns',
    element: Returns.List,
    crumb: 'Returns',
    nav: { label: 'Returns', glyph: '05', section: 'OPERATIONS' },
  },
  { path: '/returns/new/:bookingId', element: Returns.Form, crumb: 'New return' },
  {
    path: '/reports',
    element: Reports,
    crumb: 'Reports',
    nav: { label: 'Reports', glyph: '06', section: 'OPERATIONS' },
  },
  {
    path: '/settings',
    element: Settings,
    crumb: 'Settings',
    nav: { label: 'Settings', glyph: '08', section: 'ADMIN' },
  },
];

/**
 * Resolve breadcrumb trail from a pathname.
 * Always begins with the root entry, then matches each prefix progressively.
 */
export function resolveCrumbs(
  pathname: string,
  params: Readonly<Record<string, string>>,
): Array<{ to: string; label: string }> {
  const segments = pathname.split('/').filter(Boolean);
  const trail: Array<{ to: string; label: string }> = [{ to: '/', label: 'Donkor & Sons' }];
  let acc = '';
  for (const seg of segments) {
    acc += `/${seg}`;
    const def = matchPath(acc);
    if (!def) continue;
    const label = typeof def.crumb === 'function' ? def.crumb(params) : def.crumb;
    trail.push({ to: acc, label });
  }
  return trail;
}

function matchPath(path: string): RouteDef | undefined {
  const incoming = path.split('/').filter(Boolean);
  return routes.find((r) => {
    const target = r.path.split('/').filter(Boolean);
    if (target.length !== incoming.length) return false;
    return target.every((t, i) => t.startsWith(':') || t === incoming[i]);
  });
}
