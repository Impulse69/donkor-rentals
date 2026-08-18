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
  ShopProfile,
  CompanySetupInput,
  ReturnRecord,
  ReturnCreateInput,
  DamageLine,
  DamagePhoto,
  Account,
  AccountCreateInput,
  AccountUpdateInput,
  AccountFilter,
  AccountMapping,
  AccountMappingKey,
  AccountingSettings,
  JournalEntry,
  JournalEntryCreateInput,
  JournalFilter,
  Vendor,
  VendorCreateInput,
  VendorUpdateInput,
  VendorFilter,
  Expense,
  ExpenseCreateInput,
  ExpenseUpdateInput,
  ExpenseFilter,
  BillPayment,
  BillPaymentCreateInput,
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
interface TrialBalanceRow { account_id: string; code: string; name: string; account_type: string; classification: string; debit_pesewas: number; credit_pesewas: number; balance_side: 'debit' | 'credit' | 'zero'; balance_pesewas: number }
interface ProfitAndLossRow { account_id: string; code: string; name: string; account_type: 'income' | 'expense'; classification: string; amount_pesewas: number }
interface BalanceSheetRow { account_id: string; code: string; name: string; account_type: 'asset' | 'liability' | 'equity'; classification: string; amount_pesewas: number; computed?: boolean }
interface BalanceSheetReport { rows: BalanceSheetRow[]; retained_earnings_pesewas: number; current_net_income_pesewas: number; out_of_balance_pesewas: number }
interface ArAgingRow { invoice_id: string; invoice_number: string; customer_name: string; issued_at: string; due_at: string | null; total_pesewas: number; paid_as_of_pesewas: number; balance_pesewas: number; days_overdue: number; bucket: string }
interface LedgerRow { entry_id: string; line_id: string; entry_no: string; entry_date: string; memo: string | null; debit_pesewas: number; credit_pesewas: number; running_balance_pesewas: number }
interface ExpenseWithLines extends Expense { lines: unknown[]; bill_payments: BillPayment[]; paid_pesewas: number; balance_due_pesewas: number }
interface BackupManifest {
  appVersion: string;
  schemaVersion: string | null;
  createdAt: string;
  databaseFile: string;
  rowCounts: Record<string, number>;
}
interface BackupResult {
  filePath: string;
  manifestPath: string;
  manifest: BackupManifest;
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

  company: {
    getProfile: () => call<ShopProfile | null>('company:getProfile'),
    hasProfile: () => call<boolean>('company:hasProfile'),
    setup: (input: CompanySetupInput) => call<ShopProfile>('company:setup', input),
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
    invoice: (invoiceId: string, options?: { overrideStatutory?: boolean }) =>
      call<ArchivedDocument>('documents:invoice', {
        invoiceId,
        ...(options && typeof options.overrideStatutory === 'boolean'
          ? { overrideStatutory: options.overrideStatutory }
          : {}),
      }),
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
    trialBalance: (asOf: string, start?: string) =>
      call<TrialBalanceRow[]>('reports:trialBalance', { asOf, start }),
    profitAndLoss: (start: string, end: string) =>
      call<ProfitAndLossRow[]>('reports:profitAndLoss', { start, end }),
    balanceSheet: (asOf: string) => call<BalanceSheetReport>('reports:balanceSheet', { asOf }),
    arAging: (asOf: string) => call<ArAgingRow[]>('reports:arAging', { asOf }),
    generalLedger: (start: string, end: string, accountId?: string) =>
      call<LedgerRow[]>('reports:generalLedger', { start, end, accountId }),
  },

  accounts: {
    list: (filter?: AccountFilter) => call<Account[]>('accounts:list', filter ?? {}),
    get: (id: string) => call<Account | null>('accounts:get', { id }),
    create: (input: AccountCreateInput) => call<Account>('accounts:create', input),
    update: (id: string, patch: AccountUpdateInput) => call<Account>('accounts:update', { id, patch }),
    archive: (id: string) => call<{ id: string }>('accounts:archive', { id }),
    mappings: () => call<AccountMapping[]>('accounts:mappings'),
    setMapping: (key: AccountMappingKey, account_id: string) =>
      call<{ key: AccountMappingKey; account_id: string }>('accounts:setMapping', { key, account_id }),
  },

  journal: {
    list: (filter?: JournalFilter) => call<JournalEntry[]>('journal:list', filter ?? {}),
    get: (id: string) => call<JournalEntry | null>('journal:get', { id }),
    createManual: (input: JournalEntryCreateInput) => call<JournalEntry | null>('journal:createManual', input),
    void: (id: string, entry_date?: string, reason?: string) =>
      call<string>('journal:void', { id, entry_date, reason }),
  },

  accounting: {
    settings: () => call<AccountingSettings>('accounting:settings'),
    updateSettings: (patch: Partial<AccountingSettings>) =>
      call<AccountingSettings>('accounting:updateSettings', patch),
    closeBooks: (through: string) => call<AccountingSettings>('accounting:closeBooks', { through }),
    status: () => call<{ chart_ready: boolean; books_closed_through: string | null; unposted_counts: number }>('accounting:status'),
    health: (asOf: string) => call<unknown>('accounting:health', { asOf }),
  },

  vendors: {
    list: (filter?: VendorFilter) => call<Vendor[]>('vendors:list', filter ?? {}),
    get: (id: string) => call<Vendor | null>('vendors:get', { id }),
    create: (input: VendorCreateInput) => call<Vendor>('vendors:create', input),
    update: (id: string, patch: VendorUpdateInput) => call<Vendor>('vendors:update', { id, patch }),
    softDelete: (id: string) => call<{ id: string }>('vendors:softDelete', { id }),
  },

  expenses: {
    list: (filter?: ExpenseFilter) => call<Expense[]>('expenses:list', filter ?? {}),
    get: (id: string) => call<ExpenseWithLines | null>('expenses:get', { id }),
    create: (input: ExpenseCreateInput) => call<ExpenseWithLines>('expenses:create', input),
    update: (id: string, patch: ExpenseUpdateInput) => call<ExpenseWithLines>('expenses:update', { id, patch }),
    void: (id: string) => call<ExpenseWithLines>('expenses:void', { id }),
    recordBillPayment: (input: BillPaymentCreateInput) =>
      call<BillPayment>('expenses:recordBillPayment', input),
    voidBillPayment: (id: string) => call<{ id: string }>('expenses:voidBillPayment', { id }),
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

  backup: {
    create: () => call<BackupResult | null>('backup:create'),
    restore: () => call<{ restored: true; preRestorePath: string } | null>('backup:restore'),
    listRecent: () => call<BackupResult[]>('backup:listRecent'),
  },
} as const;

export type DonkorApi = typeof api;
export type { Result };

contextBridge.exposeInMainWorld('donkor', api);
