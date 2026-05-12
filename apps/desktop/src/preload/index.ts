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
  Invoice,
  InvoiceLine,
  InvoiceFilter,
  InvoiceCreateFromBooking,
  InvoiceUpdateInput,
  Payment,
  PaymentCreateInput,
  AuthSession,
  FirstRunInput,
  LocalUser,
  LocalUserCreateInput,
  SignInInput,
  SyncStatus,
  SyncConflict,
  ReturnRecord,
  ReturnCreateInput,
  DamageLine,
  DamagePhoto,
} from '../../../packages/shared/src/schemas';

interface BookingWithCustomer extends Booking {
  customer_name: string;
}
interface BookingWithLines extends BookingWithCustomer {
  lines: BookingLine[];
}

interface InvoiceListRow extends Invoice {
  customer_name: string;
  amount_paid_pesewas: number;
  balance_due_pesewas: number;
}
interface InvoiceWithLines extends Invoice {
  customer_name: string;
  booking_starts_at: string;
  booking_ends_at: string;
  lines: InvoiceLine[];
  payments: Payment[];
  amount_paid_pesewas: number;
  balance_due_pesewas: number;
}

interface ReturnWithLines extends ReturnRecord {
  customer_name: string;
  booking_starts_at: string;
  booking_ends_at: string;
  lines: DamageLine[];
  photos: DamagePhoto[];
}

interface ArchivedDocument {
  id: string;
  tenant_id: string;
  source_type: 'booking' | 'invoice' | 'payment' | 'return';
  source_id: string;
  kind: 'contract' | 'invoice' | 'receipt' | 'trip_sheet';
  title: string;
  storage_path: string | null;
  html: string;
  created_at: string;
}

interface ReportsOverview {
  revenue_today_pesewas: number;
  revenue_week_pesewas: number;
  revenue_month_pesewas: number;
  outstanding_pesewas: number;
  active_bookings: number;
  open_damage_pesewas: number;
}
interface UtilizationRow {
  item_id: string;
  item_name: string;
  kind: 'party_supply' | 'hearse';
  total_quantity: number;
  booked_quantity_days: number;
  utilization_percent: number;
}
interface TopCustomerRow {
  customer_id: string;
  customer_name: string;
  revenue_pesewas: number;
  bookings: number;
}
interface TripLogRow {
  booking_id: string;
  customer_name: string;
  starts_at: string;
  ends_at: string;
  driver_name: string | null;
  pickup_location: string | null;
  dropoff_location: string | null;
  item_name: string;
  plate: string | null;
  odometer_start_km: number | null;
  odometer_end_km: number | null;
}
interface DamageSummaryRow {
  item_id: string;
  item_name: string;
  damaged_quantity: number;
  charges_pesewas: number;
  write_offs: number;
}
interface AppSettings {
  update_channel: 'latest' | 'beta';
  crash_reporting_enabled: boolean;
  sentry_dsn: string | null;
}
interface UpdateStatus {
  channel: 'latest' | 'beta';
  allowPrerelease: boolean;
  checking: boolean;
  lastCheckAt: string | null;
  lastMessage: string | null;
  downloadPercent: number | null;
  downloadedVersion: string | null;
}
interface CrashStatus {
  enabled: boolean;
  configured: boolean;
}
interface SettingsSnapshot {
  settings: AppSettings;
  updates: UpdateStatus;
  crash: CrashStatus;
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

  invoices: {
    list: (filter?: InvoiceFilter) => call<InvoiceListRow[]>('invoices:list', filter ?? {}),
    get: (id: string) => call<InvoiceWithLines | null>('invoices:get', { id }),
    createFromBooking: (input: InvoiceCreateFromBooking) =>
      call<InvoiceWithLines>('invoices:createFromBooking', input),
    update: (id: string, patch: InvoiceUpdateInput) =>
      call<InvoiceWithLines>('invoices:update', { id, patch }),
    softDelete: (id: string) => call<{ id: string }>('invoices:softDelete', { id }),
  },

  payments: {
    record: (input: PaymentCreateInput) =>
      call<{ payment: Payment; invoice: InvoiceWithLines }>('payments:record', input),
    void: (id: string) => call<InvoiceWithLines>('payments:void', { id }),
  },

  auth: {
    getSession: () => call<AuthSession | null>('auth:getSession'),
    completeFirstRun: (input: FirstRunInput) => call<AuthSession>('auth:firstRun', input),
    hasUsers: () => call<boolean>('auth:hasUsers'),
    createUser: (input: LocalUserCreateInput) => call<LocalUser>('auth:createUser', input),
    signIn: (input: SignInInput) => call<AuthSession>('auth:signIn', input),
    signOut: () => call<void>('auth:signOut'),
  },

  sync: {
    status: () => call<SyncStatus>('sync:status'),
    drain: () => call<SyncStatus>('sync:drain'),
    retryFailed: () => call<SyncStatus>('sync:retryFailed'),
    applyInbox: () => call<{ applied: number }>('sync:applyInbox'),
    listConflicts: () => call<SyncConflict[]>('sync:listConflicts'),
    resolveConflict: (id: string, resolution: 'local' | 'remote') =>
      call<SyncConflict>('sync:resolveConflict', { id, resolution }),
  },

  returns: {
    list: () => call<Array<ReturnRecord & { customer_name: string }>>('returns:list'),
    get: (id: string) => call<ReturnWithLines | null>('returns:get', { id }),
    create: (input: ReturnCreateInput) => call<ReturnWithLines>('returns:create', input),
    attachPhoto: (damageLineId: string, storagePath: string, caption?: string | null) =>
      call<DamagePhoto>('returns:attachPhoto', { damageLineId, storagePath, caption: caption ?? null }),
  },

  documents: {
    contract: (bookingId: string) => call<ArchivedDocument>('documents:contract', { bookingId }),
    tripSheet: (bookingId: string) => call<ArchivedDocument>('documents:tripSheet', { bookingId }),
    invoice: (invoiceId: string) => call<ArchivedDocument>('documents:invoice', { invoiceId }),
    receipt: (paymentId: string) => call<ArchivedDocument>('documents:receipt', { paymentId }),
    list: (sourceType: ArchivedDocument['source_type'], sourceId: string) =>
      call<ArchivedDocument[]>('documents:list', { sourceType, sourceId }),
    printExternal: (html: string) => call<boolean>('documents:printExternal', { html }),
  },

  reports: {
    overview: () => call<ReportsOverview>('reports:overview'),
    utilization: (start: string, end: string) =>
      call<UtilizationRow[]>('reports:utilization', { start, end }),
    topCustomers: (limit?: number) => call<TopCustomerRow[]>('reports:topCustomers', { limit }),
    tripLog: (limit?: number) => call<TripLogRow[]>('reports:tripLog', { limit }),
    damageSummary: () => call<DamageSummaryRow[]>('reports:damageSummary'),
    exportCsv: () => call<string>('reports:exportCsv'),
  },

  settings: {
    get: () => call<SettingsSnapshot>('settings:get'),
    update: (patch: Partial<AppSettings>) => call<SettingsSnapshot>('settings:update', patch),
    checkForUpdates: () => call<UpdateStatus>('settings:checkForUpdates'),
    onUpdateProgress: (cb: (percent: number) => void): (() => void) => {
      const listener = (_e: unknown, percent: number): void => cb(percent);
      ipcRenderer.on('update-progress', listener);
      return () => {
        ipcRenderer.removeListener('update-progress', listener);
      };
    },
    onUpdateDownloaded: (cb: (version: string) => void): (() => void) => {
      const listener = (_e: unknown, version: string): void => cb(version);
      ipcRenderer.on('update-downloaded', listener);
      return () => {
        ipcRenderer.removeListener('update-downloaded', listener);
      };
    },
    restartAndInstall: () => call<void>('settings:restartAndInstall'),
  },
} as const;

export type DonkorApi = typeof api;
export type { Result };

contextBridge.exposeInMainWorld('donkor', api);
