import { contextBridge, ipcRenderer } from 'electron';
import type {
  Item,
  ItemCreateInput,
  ItemUpdateInput,
  ItemFilter,
  ItemUnit,
  ItemUnitCreateInput,
  ItemUnitUpdateInput,
  Customer,
  CustomerCreateInput,
  CustomerUpdateInput,
  CustomerFilter,
  Booking,
  BookingCreateInput,
  BookingUpdateInput,
  BookingFilter,
  BookingStatus,
  BookingLine,
  ConflictCheckInput,
  ConflictReport,
} from '../../../packages/shared/src/schemas';

interface BookingWithCustomer extends Booking {
  customer_name: string;
}
interface BookingWithLines extends BookingWithCustomer {
  lines: BookingLine[];
}

type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

function call<T>(channel: string, payload?: unknown): Promise<Result<T>> {
  return ipcRenderer.invoke(channel, payload);
}

const api = {
  ping: (): Promise<string> => ipcRenderer.invoke('ping'),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),

  catalog: {
    list: (filter?: ItemFilter) => call<Item[]>('catalog:list', filter ?? {}),
    get: (id: string) => call<Item | null>('catalog:get', { id }),
    create: (input: ItemCreateInput) => call<Item>('catalog:create', input),
    update: (id: string, patch: ItemUpdateInput) => call<Item>('catalog:update', { id, patch }),
    softDelete: (id: string) => call<{ id: string }>('catalog:softDelete', { id }),
    restore: (id: string) => call<{ id: string }>('catalog:restore', { id }),

    listUnits: (itemId: string) => call<ItemUnit[]>('catalog:listUnits', { itemId }),
    createUnit: (itemId: string, input: ItemUnitCreateInput) =>
      call<ItemUnit>('catalog:createUnit', { itemId, input }),
    updateUnit: (id: string, patch: ItemUnitUpdateInput) =>
      call<ItemUnit>('catalog:updateUnit', { id, patch }),
    softDeleteUnit: (id: string) => call<{ id: string }>('catalog:softDeleteUnit', { id }),
  },

  customers: {
    list: (filter?: CustomerFilter) => call<Customer[]>('customers:list', filter ?? {}),
    get: (id: string) => call<Customer | null>('customers:get', { id }),
    create: (input: CustomerCreateInput) => call<Customer>('customers:create', input),
    update: (id: string, patch: CustomerUpdateInput) =>
      call<Customer>('customers:update', { id, patch }),
    softDelete: (id: string) => call<{ id: string }>('customers:softDelete', { id }),
  },

  bookings: {
    list: (filter?: BookingFilter) => call<BookingWithCustomer[]>('bookings:list', filter ?? {}),
    get: (id: string) => call<BookingWithLines | null>('bookings:get', { id }),
    create: (input: BookingCreateInput) => call<BookingWithLines>('bookings:create', input),
    update: (id: string, patch: BookingUpdateInput) =>
      call<BookingWithLines>('bookings:update', { id, patch }),
    transition: (id: string, next: BookingStatus) =>
      call<BookingWithLines>('bookings:transition', { id, next }),
    checkConflicts: (input: ConflictCheckInput) =>
      call<ConflictReport[]>('bookings:checkConflicts', input),
    softDelete: (id: string) => call<{ id: string }>('bookings:softDelete', { id }),
  },
} as const;

export type DonkorApi = typeof api;
export type { Result };

contextBridge.exposeInMainWorld('donkor', api);
