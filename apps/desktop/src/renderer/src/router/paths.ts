/**
 * Single source of truth for outgoing URLs. Use these instead of hand-built
 * template literals so renames flow through TypeScript.
 */
export const paths = {
  home: '/',
  catalog: {
    list: '/catalog',
    new: '/catalog/new',
    detail: (id: string) => `/catalog/${id}`,
    edit: (id: string) => `/catalog/${id}/edit`,
    listFiltered: (q: { search?: string; kind?: string; status?: string }) => {
      const sp = new URLSearchParams();
      if (q.search) sp.set('q', q.search);
      if (q.kind) sp.set('kind', q.kind);
      if (q.status) sp.set('status', q.status);
      const s = sp.toString();
      return s ? `/catalog?${s}` : '/catalog';
    },
  },
  customers: {
    list: '/customers',
    new: '/customers/new',
    detail: (id: string) => `/customers/${id}`,
    edit: (id: string) => `/customers/${id}/edit`,
  },
  bookings: {
    list: '/bookings',
    calendar: '/bookings/calendar',
    new: '/bookings/new',
    detail: (id: string) => `/bookings/${id}`,
    edit: (id: string) => `/bookings/${id}/edit`,
  },
  invoices: {
    list: '/invoices',
    detail: (id: string) => `/invoices/${id}`,
    fromBooking: (bookingId: string) => `/invoices/new?from=${encodeURIComponent(bookingId)}`,
  },
} as const;
