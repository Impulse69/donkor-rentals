import { z } from 'zod';
import { IsoDate, IsoDateTime, Uuid } from './common';

export const AccountType = z.enum(['asset', 'liability', 'equity', 'income', 'expense']);
export const NormalBalance = z.enum(['debit', 'credit']);
export const AccountClassification = z.enum([
  'current_asset',
  'fixed_asset',
  'current_liability',
  'long_term_liability',
  'equity',
  'operating_income',
  'other_income',
  'cost_of_revenue',
  'operating_expense',
  'other_expense',
]);
export const AccountDetailType = z.enum([
  'accounts_payable',
  'accounts_receivable',
  'accumulated_depreciation',
  'advertising_marketing',
  'bank',
  'bank_charges',
  'card_settlement',
  'cash',
  'contra_income',
  'customer_deposits',
  'damage_recovery',
  'damage_writeoff',
  'delivery_income',
  'depreciation',
  'driver_wages',
  'fuel',
  'getfund_payable',
  'input_vat',
  'interest_expense',
  'late_fees',
  'laundry_cleaning',
  'loan_payable',
  'mobile_money',
  'nhil_payable',
  'office_equipment',
  'office_supplies',
  'other_income',
  'owner_drawings',
  'owner_equity',
  'paye_payable',
  'prepaid_expenses',
  'professional_fees',
  'rent',
  'rental_equipment',
  'rental_income',
  'repairs_maintenance',
  'retained_earnings',
  'salaries_wages',
  'service_income',
  'ssnit_employer',
  'ssnit_payable',
  'telephone_internet',
  'uncategorised_expense',
  'uncategorised_income',
  'undeposited_funds',
  'utilities',
  'vat_payable',
  'vehicle_fleet',
  'vehicle_insurance',
  'vehicle_licensing',
  'withholding_tax_payable',
]);
export const AccountMappingKey = z.enum([
  'ar',
  'ap',
  'customer_deposits',
  'cash.cash',
  'cash.mobile_money',
  'cash.bank',
  'cash.card',
  'cash.other',
  'income.default',
  'income.party_supply',
  'income.hearse',
  'income.damage_recovery',
  'income.delivery',
  'discounts_given',
  'tax.vat_payable',
  'tax.nhil_payable',
  'tax.getfund_payable',
  'tax.input_vat',
  'equity.owner',
  'equity.retained_earnings',
  'expense.default',
  'expense.damage_writeoff',
  'expense.depreciation',
]);

export const ACCOUNT_TYPE_LABELS = {
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
  income: 'Income',
  expense: 'Expense',
} as const satisfies Record<z.infer<typeof AccountType>, string>;

export const NORMAL_BALANCE_LABELS = {
  debit: 'Debit',
  credit: 'Credit',
} as const satisfies Record<z.infer<typeof NormalBalance>, string>;

export const ACCOUNT_CLASSIFICATION_LABELS = {
  current_asset: 'Current asset',
  fixed_asset: 'Fixed asset',
  current_liability: 'Current liability',
  long_term_liability: 'Long-term liability',
  equity: 'Equity',
  operating_income: 'Operating income',
  other_income: 'Other income',
  cost_of_revenue: 'Cost of revenue',
  operating_expense: 'Operating expense',
  other_expense: 'Other expense',
} as const satisfies Record<z.infer<typeof AccountClassification>, string>;

export const ACCOUNT_DETAIL_TYPE_LABELS = {
  accounts_payable: 'Accounts payable',
  accounts_receivable: 'Accounts receivable',
  accumulated_depreciation: 'Accumulated depreciation',
  advertising_marketing: 'Advertising and marketing',
  bank: 'Bank',
  bank_charges: 'Bank charges',
  card_settlement: 'Card settlement',
  cash: 'Cash',
  contra_income: 'Contra income',
  customer_deposits: 'Customer deposits',
  damage_recovery: 'Damage recovery',
  damage_writeoff: 'Damage write-off',
  delivery_income: 'Delivery income',
  depreciation: 'Depreciation',
  driver_wages: 'Driver wages',
  fuel: 'Fuel',
  getfund_payable: 'GETFund payable',
  input_vat: 'Input VAT',
  interest_expense: 'Interest expense',
  late_fees: 'Late fees',
  laundry_cleaning: 'Laundry and cleaning',
  loan_payable: 'Loan payable',
  mobile_money: 'Mobile money',
  nhil_payable: 'NHIL payable',
  office_equipment: 'Office equipment',
  office_supplies: 'Office supplies',
  other_income: 'Other income',
  owner_drawings: 'Owner drawings',
  owner_equity: 'Owner equity',
  paye_payable: 'PAYE payable',
  prepaid_expenses: 'Prepaid expenses',
  professional_fees: 'Professional fees',
  rent: 'Rent',
  rental_equipment: 'Rental equipment',
  rental_income: 'Rental income',
  repairs_maintenance: 'Repairs and maintenance',
  retained_earnings: 'Retained earnings',
  salaries_wages: 'Salaries and wages',
  service_income: 'Service income',
  ssnit_employer: 'SSNIT employer contribution',
  ssnit_payable: 'SSNIT payable',
  telephone_internet: 'Telephone and internet',
  uncategorised_expense: 'Uncategorised expense',
  uncategorised_income: 'Uncategorised income',
  undeposited_funds: 'Undeposited funds',
  utilities: 'Utilities',
  vat_payable: 'VAT payable',
  vehicle_fleet: 'Vehicle fleet',
  vehicle_insurance: 'Vehicle insurance',
  vehicle_licensing: 'Vehicle licensing',
  withholding_tax_payable: 'Withholding tax payable',
} as const satisfies Record<z.infer<typeof AccountDetailType>, string>;

export const ACCOUNT_MAPPING_KEY_LABELS = {
  ar: 'Accounts receivable',
  ap: 'Accounts payable',
  customer_deposits: 'Customer deposits',
  'cash.cash': 'Cash on hand',
  'cash.mobile_money': 'Mobile money',
  'cash.bank': 'Bank',
  'cash.card': 'Card settlement',
  'cash.other': 'Other cash clearing',
  'income.default': 'Default income',
  'income.party_supply': 'Party supply income',
  'income.hearse': 'Hearse income',
  'income.damage_recovery': 'Damage recovery income',
  'income.delivery': 'Delivery income',
  discounts_given: 'Discounts given',
  'tax.vat_payable': 'VAT payable',
  'tax.nhil_payable': 'NHIL payable',
  'tax.getfund_payable': 'GETFund payable',
  'tax.input_vat': 'Input VAT',
  'equity.owner': 'Owner equity',
  'equity.retained_earnings': 'Retained earnings',
  'expense.default': 'Default expense',
  'expense.damage_writeoff': 'Damage write-off',
  'expense.depreciation': 'Depreciation expense',
} as const satisfies Record<z.infer<typeof AccountMappingKey>, string>;

export const ACCOUNT_TYPE_OPTIONS = (Object.keys(ACCOUNT_TYPE_LABELS) as Array<keyof typeof ACCOUNT_TYPE_LABELS>)
  .map((value) => ({ value, label: ACCOUNT_TYPE_LABELS[value] }));
export const NORMAL_BALANCE_OPTIONS = (Object.keys(NORMAL_BALANCE_LABELS) as Array<keyof typeof NORMAL_BALANCE_LABELS>)
  .map((value) => ({ value, label: NORMAL_BALANCE_LABELS[value] }));
export const ACCOUNT_CLASSIFICATION_OPTIONS = (
  Object.keys(ACCOUNT_CLASSIFICATION_LABELS) as Array<keyof typeof ACCOUNT_CLASSIFICATION_LABELS>
).map((value) => ({ value, label: ACCOUNT_CLASSIFICATION_LABELS[value] }));
export const ACCOUNT_DETAIL_TYPE_OPTIONS = (
  Object.keys(ACCOUNT_DETAIL_TYPE_LABELS) as Array<keyof typeof ACCOUNT_DETAIL_TYPE_LABELS>
).map((value) => ({ value, label: ACCOUNT_DETAIL_TYPE_LABELS[value] }));
export const ACCOUNT_MAPPING_KEY_OPTIONS = (
  Object.keys(ACCOUNT_MAPPING_KEY_LABELS) as Array<keyof typeof ACCOUNT_MAPPING_KEY_LABELS>
).map((value) => ({ value, label: ACCOUNT_MAPPING_KEY_LABELS[value] }));

export const DETAIL_TYPES_BY_ACCOUNT_TYPE = {
  asset: [
    'cash',
    'undeposited_funds',
    'mobile_money',
    'bank',
    'card_settlement',
    'accounts_receivable',
    'input_vat',
    'prepaid_expenses',
    'rental_equipment',
    'accumulated_depreciation',
    'vehicle_fleet',
    'office_equipment',
  ],
  liability: [
    'accounts_payable',
    'customer_deposits',
    'vat_payable',
    'nhil_payable',
    'getfund_payable',
    'paye_payable',
    'ssnit_payable',
    'withholding_tax_payable',
    'loan_payable',
  ],
  equity: ['owner_equity', 'owner_drawings', 'retained_earnings'],
  income: ['rental_income', 'service_income', 'delivery_income', 'damage_recovery', 'late_fees', 'contra_income', 'uncategorised_income', 'other_income'],
  expense: [
    'fuel',
    'driver_wages',
    'repairs_maintenance',
    'vehicle_insurance',
    'vehicle_licensing',
    'laundry_cleaning',
    'damage_writeoff',
    'salaries_wages',
    'ssnit_employer',
    'rent',
    'utilities',
    'telephone_internet',
    'advertising_marketing',
    'office_supplies',
    'bank_charges',
    'professional_fees',
    'depreciation',
    'uncategorised_expense',
    'interest_expense',
  ],
} as const satisfies Record<z.infer<typeof AccountType>, ReadonlyArray<z.infer<typeof AccountDetailType>>>;

export const Account = z.object({
  id: Uuid,
  tenant_id: Uuid,
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
  account_type: AccountType,
  detail_type: AccountDetailType,
  classification: AccountClassification,
  normal_balance: NormalBalance,
  parent_id: Uuid.nullable(),
  system_key: z.string().max(120).nullable(),
  is_active: z.boolean(),
  is_system: z.boolean(),
  sort_order: z.number().int(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  deleted_at: IsoDateTime.nullable(),
});

export const AccountCreateInput = Account.omit({
  id: true,
  tenant_id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
});

export const AccountUpdateInput = AccountCreateInput.partial();

export const AccountFilter = z.object({
  accountType: AccountType.optional(),
  classification: AccountClassification.optional(),
  search: z.string().trim().max(200).optional(),
  includeInactive: z.boolean().optional(),
  includeDeleted: z.boolean().optional(),
});

export const AccountMapping = z.object({
  tenant_id: Uuid,
  key: AccountMappingKey,
  account_id: Uuid,
  updated_at: IsoDateTime,
});

export const AccountingSettings = z.object({
  tenant_id: Uuid,
  fiscal_year_start_month: z.number().int().min(1).max(12),
  books_closed_through: IsoDate.nullable(),
  vat_registered: z.boolean(),
  posting_version: z.number().int().positive(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
});

export type AccountType = z.infer<typeof AccountType>;
export type NormalBalance = z.infer<typeof NormalBalance>;
export type AccountClassification = z.infer<typeof AccountClassification>;
export type AccountDetailType = z.infer<typeof AccountDetailType>;
export type AccountMappingKey = z.infer<typeof AccountMappingKey>;
export type Account = z.infer<typeof Account>;
export type AccountCreateInput = z.infer<typeof AccountCreateInput>;
export type AccountUpdateInput = z.infer<typeof AccountUpdateInput>;
export type AccountFilter = z.infer<typeof AccountFilter>;
export type AccountMapping = z.infer<typeof AccountMapping>;
export type AccountingSettings = z.infer<typeof AccountingSettings>;
