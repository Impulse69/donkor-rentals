/**
 * Thin wrappers around `window.donkor.*`. Every IPC call returns a Result<T>;
 * these helpers unwrap to throw on failure (so callers can use try/catch and
 * components can rely on a single error path).
 */
export class IpcError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'IpcError';
  }
}

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export async function unwrap<T>(p: Promise<Result<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new IpcError(r.error.code, r.error.message);
  return r.data;
}

export const api = {
  catalog: {
    list: (filter?: Parameters<typeof window.donkor.catalog.list>[0]) =>
      unwrap(window.donkor.catalog.list(filter)),
    get: (id: string) => unwrap(window.donkor.catalog.get(id)),
    create: (input: Parameters<typeof window.donkor.catalog.create>[0]) =>
      unwrap(window.donkor.catalog.create(input)),
    update: (id: string, patch: Parameters<typeof window.donkor.catalog.update>[1]) =>
      unwrap(window.donkor.catalog.update(id, patch)),
    softDelete: (id: string) => unwrap(window.donkor.catalog.softDelete(id)),
    restore: (id: string) => unwrap(window.donkor.catalog.restore(id)),
    listUnits: (itemId: string) => unwrap(window.donkor.catalog.listUnits(itemId)),
    createUnit: (itemId: string, input: Parameters<typeof window.donkor.catalog.createUnit>[1]) =>
      unwrap(window.donkor.catalog.createUnit(itemId, input)),
    updateUnit: (id: string, patch: Parameters<typeof window.donkor.catalog.updateUnit>[1]) =>
      unwrap(window.donkor.catalog.updateUnit(id, patch)),
    softDeleteUnit: (id: string) => unwrap(window.donkor.catalog.softDeleteUnit(id)),
  },
  customers: {
    list: (filter?: Parameters<typeof window.donkor.customers.list>[0]) =>
      unwrap(window.donkor.customers.list(filter)),
    get: (id: string) => unwrap(window.donkor.customers.get(id)),
    create: (input: Parameters<typeof window.donkor.customers.create>[0]) =>
      unwrap(window.donkor.customers.create(input)),
    update: (id: string, patch: Parameters<typeof window.donkor.customers.update>[1]) =>
      unwrap(window.donkor.customers.update(id, patch)),
    softDelete: (id: string) => unwrap(window.donkor.customers.softDelete(id)),
  },
  bookings: {
    list: (filter?: Parameters<typeof window.donkor.bookings.list>[0]) =>
      unwrap(window.donkor.bookings.list(filter)),
    get: (id: string) => unwrap(window.donkor.bookings.get(id)),
    create: (input: Parameters<typeof window.donkor.bookings.create>[0]) =>
      unwrap(window.donkor.bookings.create(input)),
    update: (id: string, patch: Parameters<typeof window.donkor.bookings.update>[1]) =>
      unwrap(window.donkor.bookings.update(id, patch)),
    transition: (id: string, next: Parameters<typeof window.donkor.bookings.transition>[1]) =>
      unwrap(window.donkor.bookings.transition(id, next)),
    checkConflicts: (input: Parameters<typeof window.donkor.bookings.checkConflicts>[0]) =>
      unwrap(window.donkor.bookings.checkConflicts(input)),
    softDelete: (id: string) => unwrap(window.donkor.bookings.softDelete(id)),
  },
  invoices: {
    list: (filter?: Parameters<typeof window.donkor.invoices.list>[0]) =>
      unwrap(window.donkor.invoices.list(filter)),
    get: (id: string) => unwrap(window.donkor.invoices.get(id)),
    createFromBooking: (input: Parameters<typeof window.donkor.invoices.createFromBooking>[0]) =>
      unwrap(window.donkor.invoices.createFromBooking(input)),
    update: (id: string, patch: Parameters<typeof window.donkor.invoices.update>[1]) =>
      unwrap(window.donkor.invoices.update(id, patch)),
    softDelete: (id: string) => unwrap(window.donkor.invoices.softDelete(id)),
  },
  payments: {
    record: (input: Parameters<typeof window.donkor.payments.record>[0]) =>
      unwrap(window.donkor.payments.record(input)),
    void: (id: string) => unwrap(window.donkor.payments.void(id)),
  },
  auth: {
    getSession: () => unwrap(window.donkor.auth.getSession()),
    completeFirstRun: (input: Parameters<typeof window.donkor.auth.completeFirstRun>[0]) =>
      unwrap(window.donkor.auth.completeFirstRun(input)),
    hasUsers: () => unwrap(window.donkor.auth.hasUsers()),
    createUser: (input: Parameters<typeof window.donkor.auth.createUser>[0]) =>
      unwrap(window.donkor.auth.createUser(input)),
    signIn: (input: Parameters<typeof window.donkor.auth.signIn>[0]) =>
      unwrap(window.donkor.auth.signIn(input)),
    signOut: () => unwrap(window.donkor.auth.signOut()),
  },
  sync: {
    status: () => unwrap(window.donkor.sync.status()),
    drain: () => unwrap(window.donkor.sync.drain()),
    retryFailed: () => unwrap(window.donkor.sync.retryFailed()),
    applyInbox: () => unwrap(window.donkor.sync.applyInbox()),
    listConflicts: () => unwrap(window.donkor.sync.listConflicts()),
    resolveConflict: (id: string, resolution: 'local' | 'remote') =>
      unwrap(window.donkor.sync.resolveConflict(id, resolution)),
  },
  returns: {
    list: () => unwrap(window.donkor.returns.list()),
    get: (id: string) => unwrap(window.donkor.returns.get(id)),
    create: (input: Parameters<typeof window.donkor.returns.create>[0]) =>
      unwrap(window.donkor.returns.create(input)),
    attachPhoto: (damageLineId: string, storagePath: string, caption?: string | null) =>
      unwrap(window.donkor.returns.attachPhoto(damageLineId, storagePath, caption)),
  },
  documents: {
    contract: (bookingId: string) => unwrap(window.donkor.documents.contract(bookingId)),
    tripSheet: (bookingId: string) => unwrap(window.donkor.documents.tripSheet(bookingId)),
    invoice: (invoiceId: string) => unwrap(window.donkor.documents.invoice(invoiceId)),
    receipt: (paymentId: string) => unwrap(window.donkor.documents.receipt(paymentId)),
    list: (sourceType: Parameters<typeof window.donkor.documents.list>[0], sourceId: string) =>
      unwrap(window.donkor.documents.list(sourceType, sourceId)),
  },
  reports: {
    overview: () => unwrap(window.donkor.reports.overview()),
    utilization: (start: string, end: string) => unwrap(window.donkor.reports.utilization(start, end)),
    topCustomers: (limit?: number) => unwrap(window.donkor.reports.topCustomers(limit)),
    tripLog: (limit?: number) => unwrap(window.donkor.reports.tripLog(limit)),
    damageSummary: () => unwrap(window.donkor.reports.damageSummary()),
    exportCsv: () => unwrap(window.donkor.reports.exportCsv()),
  },
  settings: {
    get: () => unwrap(window.donkor.settings.get()),
    update: (patch: Parameters<typeof window.donkor.settings.update>[0]) =>
      unwrap(window.donkor.settings.update(patch)),
    checkForUpdates: () => unwrap(window.donkor.settings.checkForUpdates()),
    onUpdateProgress: window.donkor.settings.onUpdateProgress,
    onUpdateDownloaded: window.donkor.settings.onUpdateDownloaded,
    restartAndInstall: () => unwrap(window.donkor.settings.restartAndInstall()),
  },
};
