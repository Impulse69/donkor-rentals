import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Route definitions. Single source of truth used by:
 *  - the `<Routes>` tree (App.tsx)
 *  - the sidebar nav (driven by `nav` entries)
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
    icon: 'dashboard' | 'invoice' | 'customers' | 'bookings' | 'products' | 'returns' | 'calendar' | 'reports' | 'expenses' | 'vendors' | 'chart' | 'journal';
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

const Expenses = {
  List: lazy(() => import('../routes/expenses/List')),
  Form: lazy(() => import('../routes/expenses/Form')),
  Detail: lazy(() => import('../routes/expenses/Detail')),
};

const Vendors = {
  List: lazy(() => import('../routes/expenses/VendorsList')),
  Form: lazy(() => import('../routes/expenses/VendorForm')),
  Detail: lazy(() => import('../routes/expenses/VendorDetail')),
};

const Accounting = {
  Chart: lazy(() => import('../routes/accounting/Chart')),
  Register: lazy(() => import('../routes/accounting/Register')),
  JournalList: lazy(() => import('../routes/accounting/JournalList')),
  JournalForm: lazy(() => import('../routes/accounting/JournalForm')),
};

const Settings = lazy(() => import('../routes/Settings'));
const Reports = lazy(() => import('../routes/Reports'));
const Dashboard = lazy(() => import('../routes/Dashboard'));

export const routes: RouteDef[] = [
  {
    path: '/',
    element: Dashboard,
    crumb: 'Dashboard',
    nav: { label: 'Dashboard', icon: 'dashboard' },
  },

  {
    path: '/catalog',
    element: Catalog.List,
    crumb: 'Products and Services',
    nav: { label: 'Products and Services', icon: 'products', section: 'SALES' },
  },
  { path: '/catalog/new', element: Catalog.Form, crumb: 'New product or service' },
  { path: '/catalog/:id', element: Catalog.Detail, crumb: 'Product or service' },
  { path: '/catalog/:id/edit', element: Catalog.Form, crumb: 'Edit product or service' },

  {
    path: '/customers',
    element: Customers.List,
    crumb: 'Customers',
    nav: { label: 'Customers', icon: 'customers', section: 'SALES' },
  },
  { path: '/customers/new', element: Customers.Form, crumb: 'New customer' },
  { path: '/customers/:id', element: Customers.Detail, crumb: 'Customer' },
  { path: '/customers/:id/edit', element: Customers.Form, crumb: 'Edit' },

  {
    path: '/bookings',
    element: Bookings.List,
    crumb: 'Bookings',
    nav: { label: 'Bookings', icon: 'bookings', section: 'SALES' },
  },
  {
    path: '/bookings/calendar',
    element: Bookings.Calendar,
    crumb: 'Calendar',
    nav: { label: 'Calendar', icon: 'calendar', section: 'RENTALS' },
  },
  { path: '/bookings/new', element: Bookings.Form, crumb: 'New booking' },
  { path: '/bookings/:id', element: Bookings.Detail, crumb: 'Booking' },
  { path: '/bookings/:id/edit', element: Bookings.Form, crumb: 'Edit' },

  {
    path: '/invoices',
    element: Invoices.List,
    crumb: 'Invoices',
    nav: { label: 'Invoices', icon: 'invoice', section: 'SALES' },
  },
  { path: '/invoices/new', element: Invoices.New, crumb: 'New invoice' },
  { path: '/invoices/:id', element: Invoices.Detail, crumb: 'Invoice' },

  {
    path: '/returns',
    element: Returns.List,
    crumb: 'Returns',
    nav: { label: 'Returns', icon: 'returns', section: 'RENTALS' },
  },
  { path: '/returns/new/:bookingId', element: Returns.Form, crumb: 'New return' },
  {
    path: '/expenses',
    element: Expenses.List,
    crumb: 'Expenses',
    nav: { label: 'Expenses', icon: 'expenses', section: 'EXPENSES' },
  },
  { path: '/expenses/new', element: Expenses.Form, crumb: 'New expense' },
  { path: '/expenses/:id', element: Expenses.Detail, crumb: 'Expense' },
  {
    path: '/expenses/vendors',
    element: Vendors.List,
    crumb: 'Vendors',
    nav: { label: 'Vendors', icon: 'vendors', section: 'EXPENSES' },
  },
  { path: '/expenses/vendors/new', element: Vendors.Form, crumb: 'New vendor' },
  { path: '/expenses/vendors/:id', element: Vendors.Detail, crumb: 'Vendor' },
  { path: '/expenses/vendors/:id/edit', element: Vendors.Form, crumb: 'Edit vendor' },
  {
    path: '/accounting/chart',
    element: Accounting.Chart,
    crumb: 'Chart of Accounts',
    nav: { label: 'Chart of Accounts', icon: 'chart', section: 'ACCOUNTING' },
  },
  { path: '/accounting/accounts/:id', element: Accounting.Register, crumb: 'Account register' },
  {
    path: '/accounting/journal',
    element: Accounting.JournalList,
    crumb: 'Journal Entries',
    nav: { label: 'Journal Entries', icon: 'journal', section: 'ACCOUNTING' },
  },
  { path: '/accounting/journal/new', element: Accounting.JournalForm, crumb: 'New journal entry' },
  { path: '/accounting/journal/:id', element: Accounting.JournalForm, crumb: 'Journal entry' },
  {
    path: '/reports',
    element: Reports,
    crumb: 'Reports',
    nav: { label: 'Reports', icon: 'reports', section: 'REPORTS' },
  },
  {
    path: '/settings',
    element: Settings,
    crumb: 'Settings',
  },
];

/**
 * Resolve breadcrumb trail from a pathname.
 * Always begins with the root entry and keeps only the immediate parent/current page.
 */
export function resolveCrumbs(
  pathname: string,
  params: Readonly<Record<string, string>>,
): Array<{ to: string; label: string }> {
  const segments = pathname.split('/').filter(Boolean);
  const trail: Array<{ to: string; label: string }> = [{ to: '/', label: 'Donkor & Sons' }];
  if (segments.length === 0) return trail;

  const parentPath = segments.length > 1 ? `/${segments[0]}` : pathname;
  const parentDef = matchPath(parentPath);
  if (parentDef && parentPath !== '/') {
    const label = typeof parentDef.crumb === 'function' ? parentDef.crumb(params) : parentDef.crumb;
    trail.push({ to: parentPath, label });
  }

  if (pathname !== parentPath) {
    const currentDef = matchPath(pathname);
    if (currentDef) {
      const label = typeof currentDef.crumb === 'function' ? currentDef.crumb(params) : currentDef.crumb;
      trail.push({ to: pathname, label });
    }
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
