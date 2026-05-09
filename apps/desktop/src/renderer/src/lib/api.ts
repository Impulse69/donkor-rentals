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
};
