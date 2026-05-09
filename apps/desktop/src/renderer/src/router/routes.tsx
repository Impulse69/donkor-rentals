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

const Dashboard = lazy(() => import('../routes/Dashboard'));

export const routes: RouteDef[] = [
  {
    path: '/',
    element: Dashboard,
    crumb: 'Overview',
    nav: { label: 'Overview', glyph: '00', section: 'WORKSPACE' },
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
