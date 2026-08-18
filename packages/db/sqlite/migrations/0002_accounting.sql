/*
  Phase 5a accounting data model conventions:
  - journal_entries and journal_lines have no deleted_at. The ledger is append-only;
    mistakes are corrected with reversing entries, never deletes.
  - entry_date and txn_date are calendar dates in YYYY-MM-DD format, not ISO datetimes.
    Report bucketing keys off them. created_at/updated_at remain full ISO timestamps.
  - debit_pesewas and credit_pesewas are always >= 0. Direction is carried by which
    column is non-zero, never by a negative amount.
  - No triggers. Posting happens in the repository layer in Phase 5b.
*/

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
  id              TEXT PRIMARY KEY NOT NULL,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  account_type    TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  detail_type     TEXT NOT NULL,
  classification  TEXT NOT NULL,
  normal_balance  TEXT NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
  parent_id       TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
  system_key      TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  is_system       INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT,
  UNIQUE (tenant_id, code),
  CHECK (
    (account_type IN ('asset', 'expense') AND normal_balance = 'debit')
    OR (account_type IN ('liability', 'equity', 'income') AND normal_balance = 'credit')
  )
);

CREATE INDEX IF NOT EXISTS accounts_tenant_type_idx ON accounts (tenant_id, account_type, sort_order) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_tenant_system_key_idx
  ON accounts (tenant_id, system_key) WHERE system_key IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS account_templates (
  code            TEXT PRIMARY KEY NOT NULL,
  name            TEXT NOT NULL,
  account_type    TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  detail_type     TEXT NOT NULL,
  classification  TEXT NOT NULL,
  normal_balance  TEXT NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
  system_key      TEXT,
  mapping_key     TEXT,
  is_system       INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  description     TEXT,
  CHECK (
    (account_type IN ('asset', 'expense') AND normal_balance = 'debit')
    OR (account_type IN ('liability', 'equity', 'income') AND normal_balance = 'credit')
  )
);

CREATE TABLE IF NOT EXISTS account_mappings (
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key         TEXT NOT NULL CHECK (key IN (
    'ar', 'ap', 'customer_deposits',
    'cash.cash', 'cash.mobile_money', 'cash.bank', 'cash.card', 'cash.other',
    'income.default', 'income.party_supply', 'income.hearse', 'income.damage_recovery', 'income.delivery',
    'discounts_given',
    'tax.vat_payable', 'tax.nhil_payable', 'tax.getfund_payable', 'tax.input_vat',
    'equity.owner', 'equity.retained_earnings',
    'expense.default', 'expense.damage_writeoff', 'expense.depreciation'
  )),
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS vendors (
  id                         TEXT PRIMARY KEY NOT NULL,
  tenant_id                  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                       TEXT NOT NULL,
  phone                      TEXT,
  email                      TEXT,
  tin                        TEXT,
  address                    TEXT,
  notes                      TEXT,
  default_expense_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  created_at                 TEXT NOT NULL,
  updated_at                 TEXT NOT NULL,
  deleted_at                 TEXT
);

CREATE INDEX IF NOT EXISTS vendors_tenant_name_idx ON vendors (tenant_id, name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS vendors_tenant_phone_idx ON vendors (tenant_id, phone) WHERE deleted_at IS NULL AND phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS journal_entries (
  id               TEXT PRIMARY KEY NOT NULL,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entry_no         TEXT NOT NULL,
  entry_date       TEXT NOT NULL CHECK (entry_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  memo             TEXT,
  status           TEXT NOT NULL CHECK (status IN ('posted', 'void')),
  origin           TEXT NOT NULL CHECK (origin IN ('auto', 'manual')),
  source_type      TEXT NOT NULL CHECK (source_type IN ('invoice', 'payment', 'return', 'expense', 'bill_payment', 'manual')),
  source_id        TEXT,
  source_event     TEXT,
  source_key       TEXT NOT NULL,
  reversal_of_id   TEXT REFERENCES journal_entries(id) ON DELETE RESTRICT,
  reversed_by_id   TEXT REFERENCES journal_entries(id) ON DELETE RESTRICT,
  posting_version  INTEGER NOT NULL DEFAULT 1 CHECK (posting_version > 0),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  UNIQUE (tenant_id, entry_no),
  UNIQUE (tenant_id, source_key)
);

CREATE INDEX IF NOT EXISTS journal_entries_tenant_date_status_idx ON journal_entries (tenant_id, entry_date, status);
CREATE INDEX IF NOT EXISTS journal_entries_tenant_source_idx ON journal_entries (tenant_id, source_type, source_id);

CREATE TABLE IF NOT EXISTS journal_lines (
  id              TEXT PRIMARY KEY NOT NULL,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entry_id        TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,
  line_no         INTEGER NOT NULL CHECK (line_no > 0),
  account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  debit_pesewas   INTEGER NOT NULL DEFAULT 0 CHECK (debit_pesewas >= 0),
  credit_pesewas  INTEGER NOT NULL DEFAULT 0 CHECK (credit_pesewas >= 0),
  memo            TEXT,
  customer_id     TEXT REFERENCES customers(id) ON DELETE SET NULL,
  vendor_id       TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  item_id         TEXT REFERENCES items(id) ON DELETE SET NULL,
  item_unit_id    TEXT REFERENCES item_units(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL,
  UNIQUE (entry_id, line_no),
  CHECK ((debit_pesewas = 0) <> (credit_pesewas = 0))
);

CREATE INDEX IF NOT EXISTS journal_lines_entry_idx ON journal_lines (entry_id);
CREATE INDEX IF NOT EXISTS journal_lines_account_idx ON journal_lines (tenant_id, account_id);

CREATE TABLE IF NOT EXISTS expenses (
  id                       TEXT PRIMARY KEY NOT NULL,
  tenant_id                TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vendor_id                TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  kind                     TEXT NOT NULL CHECK (kind IN ('expense', 'bill')),
  number                   TEXT NOT NULL,
  status                   TEXT NOT NULL CHECK (status IN ('draft', 'recorded', 'paid', 'void')),
  txn_date                 TEXT NOT NULL CHECK (txn_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  due_date                 TEXT CHECK (due_date IS NULL OR due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  payment_account_id       TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
  payment_method           TEXT CHECK (payment_method IS NULL OR payment_method IN ('cash', 'mobile_money', 'bank', 'card', 'other')),
  reference                TEXT,
  memo                     TEXT,
  subtotal_pesewas         INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_pesewas >= 0),
  tax_pesewas              INTEGER NOT NULL DEFAULT 0 CHECK (tax_pesewas >= 0),
  total_pesewas            INTEGER NOT NULL DEFAULT 0 CHECK (total_pesewas >= 0),
  item_unit_id             TEXT REFERENCES item_units(id) ON DELETE SET NULL,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,
  deleted_at               TEXT,
  UNIQUE (tenant_id, number),
  CHECK ((kind = 'bill' AND payment_account_id IS NULL) OR (kind = 'expense' AND payment_account_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS expenses_tenant_status_idx ON expenses (tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS expenses_vendor_idx ON expenses (vendor_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS expense_lines (
  id                   TEXT PRIMARY KEY NOT NULL,
  tenant_id            TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expense_id           TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  account_id           TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  description          TEXT NOT NULL,
  quantity             INTEGER NOT NULL CHECK (quantity > 0),
  unit_amount_pesewas  INTEGER NOT NULL CHECK (unit_amount_pesewas >= 0),
  amount_pesewas       INTEGER NOT NULL CHECK (amount_pesewas >= 0),
  item_unit_id         TEXT REFERENCES item_units(id) ON DELETE SET NULL,
  sort_order           INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  deleted_at           TEXT
);

CREATE INDEX IF NOT EXISTS expense_lines_expense_idx ON expense_lines (expense_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS bill_payments (
  id                    TEXT PRIMARY KEY NOT NULL,
  tenant_id             TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expense_id            TEXT NOT NULL REFERENCES expenses(id) ON DELETE RESTRICT,
  paid_from_account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  amount_pesewas        INTEGER NOT NULL CHECK (amount_pesewas > 0),
  method                TEXT NOT NULL CHECK (method IN ('cash', 'mobile_money', 'bank', 'card', 'other')),
  reference             TEXT,
  paid_at               TEXT NOT NULL,
  notes                 TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  deleted_at            TEXT
);

CREATE INDEX IF NOT EXISTS bill_payments_expense_idx ON bill_payments (expense_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS accounting_settings (
  tenant_id                 TEXT PRIMARY KEY NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fiscal_year_start_month   INTEGER NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  books_closed_through      TEXT CHECK (books_closed_through IS NULL OR books_closed_through GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  vat_registered            INTEGER NOT NULL DEFAULT 1 CHECK (vat_registered IN (0, 1)),
  posting_version           INTEGER NOT NULL DEFAULT 1 CHECK (posting_version > 0),
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS journal_sequences (
  tenant_id   TEXT PRIMARY KEY NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  next_value  INTEGER NOT NULL DEFAULT 1 CHECK (next_value > 0)
);

CREATE TABLE IF NOT EXISTS expense_sequences (
  tenant_id   TEXT PRIMARY KEY NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  next_value  INTEGER NOT NULL DEFAULT 1 CHECK (next_value > 0)
);

INSERT INTO account_templates
  (code, name, account_type, detail_type, classification, normal_balance, system_key, mapping_key, is_system, sort_order, description)
VALUES
  ('1000', 'Cash on Hand', 'asset', 'cash', 'current_asset', 'debit', 'cash.cash', 'cash.cash', 1, 1000, 'Physical cash held by the business.'),
  ('1010', 'Undeposited Funds', 'asset', 'undeposited_funds', 'current_asset', 'debit', 'cash.other', 'cash.other', 1, 1010, 'Receipts awaiting deposit or allocation.'),
  ('1050', 'Mobile Money Wallet', 'asset', 'mobile_money', 'current_asset', 'debit', 'cash.mobile_money', 'cash.mobile_money', 1, 1050, 'Mobile money wallet balances.'),
  ('1100', 'Bank Main Current Account', 'asset', 'bank', 'current_asset', 'debit', 'cash.bank', 'cash.bank', 1, 1100, 'Main operating bank account.'),
  ('1110', 'Card Settlement Account', 'asset', 'card_settlement', 'current_asset', 'debit', 'cash.card', 'cash.card', 1, 1110, 'Card processor settlement clearing account.'),
  ('1200', 'Accounts Receivable (A/R)', 'asset', 'accounts_receivable', 'current_asset', 'debit', 'ar', 'ar', 1, 1200, 'Customer invoice balances due.'),
  ('1250', 'Input VAT Recoverable', 'asset', 'input_vat', 'current_asset', 'debit', 'tax.input_vat', 'tax.input_vat', 1, 1250, 'Recoverable input VAT on purchases.'),
  ('1300', 'Prepaid Expenses', 'asset', 'prepaid_expenses', 'current_asset', 'debit', NULL, NULL, 0, 1300, 'Payments made ahead of the expense period.'),
  ('1500', 'Rental Equipment Party Supplies', 'asset', 'rental_equipment', 'fixed_asset', 'debit', NULL, NULL, 0, 1500, 'Party supply rental equipment at cost.'),
  ('1510', 'Accumulated Depreciation Party Supplies', 'asset', 'accumulated_depreciation', 'fixed_asset', 'debit', NULL, NULL, 0, 1510, 'Contra asset reported as accumulated depreciation.'),
  ('1600', 'Hearse Fleet', 'asset', 'vehicle_fleet', 'fixed_asset', 'debit', NULL, NULL, 0, 1600, 'Hearse fleet at cost.'),
  ('1610', 'Accumulated Depreciation Hearse Fleet', 'asset', 'accumulated_depreciation', 'fixed_asset', 'debit', NULL, NULL, 0, 1610, 'Contra asset reported as accumulated depreciation.'),
  ('1700', 'Furniture and Office Equipment', 'asset', 'office_equipment', 'fixed_asset', 'debit', NULL, NULL, 0, 1700, 'Office furniture and equipment at cost.'),
  ('2000', 'Accounts Payable (A/P)', 'liability', 'accounts_payable', 'current_liability', 'credit', 'ap', 'ap', 1, 2000, 'Supplier bill balances owed.'),
  ('2100', 'Customer Deposits Held', 'liability', 'customer_deposits', 'current_liability', 'credit', 'customer_deposits', 'customer_deposits', 1, 2100, 'Customer deposits and advance receipts.'),
  ('2200', 'VAT Payable', 'liability', 'vat_payable', 'current_liability', 'credit', 'tax.vat_payable', 'tax.vat_payable', 1, 2200, 'Output VAT payable to GRA.'),
  ('2210', 'NHIL Payable', 'liability', 'nhil_payable', 'current_liability', 'credit', 'tax.nhil_payable', 'tax.nhil_payable', 1, 2210, 'NHIL payable to GRA.'),
  ('2220', 'GETFund Levy Payable', 'liability', 'getfund_payable', 'current_liability', 'credit', 'tax.getfund_payable', 'tax.getfund_payable', 1, 2220, 'GETFund levy payable to GRA.'),
  ('2300', 'PAYE Withholding Payable', 'liability', 'paye_payable', 'current_liability', 'credit', NULL, NULL, 0, 2300, 'PAYE withholding tax owed.'),
  ('2310', 'SSNIT Payable', 'liability', 'ssnit_payable', 'current_liability', 'credit', NULL, NULL, 0, 2310, 'SSNIT contributions owed.'),
  ('2400', 'Withholding Tax Payable', 'liability', 'withholding_tax_payable', 'current_liability', 'credit', NULL, NULL, 0, 2400, 'Withholding tax owed.'),
  ('2500', 'Bank Loan', 'liability', 'loan_payable', 'long_term_liability', 'credit', NULL, NULL, 0, 2500, 'Bank loan principal owed.'),
  ('3000', 'Owner Equity', 'equity', 'owner_equity', 'equity', 'credit', 'equity.owner', 'equity.owner', 1, 3000, 'Owner capital invested in the business.'),
  ('3100', 'Owner Drawings', 'equity', 'owner_drawings', 'equity', 'credit', NULL, NULL, 0, 3100, 'Contra equity reported as owner drawings.'),
  ('3900', 'Retained Earnings', 'equity', 'retained_earnings', 'equity', 'credit', 'equity.retained_earnings', 'equity.retained_earnings', 1, 3900, 'Accumulated retained earnings.'),
  ('4000', 'Rental Income Party Supplies', 'income', 'rental_income', 'operating_income', 'credit', 'income.party_supply', 'income.party_supply', 1, 4000, 'Party supply rental income.'),
  ('4010', 'Hearse Service Income', 'income', 'service_income', 'operating_income', 'credit', 'income.hearse', 'income.hearse', 1, 4010, 'Hearse service income.'),
  ('4020', 'Delivery and Setup Income', 'income', 'delivery_income', 'operating_income', 'credit', 'income.delivery', 'income.delivery', 1, 4020, 'Delivery and setup income.'),
  ('4100', 'Damage Recovery Income', 'income', 'damage_recovery', 'operating_income', 'credit', 'income.damage_recovery', 'income.damage_recovery', 1, 4100, 'Damage recovery charges billed to customers.'),
  ('4200', 'Late Fees and Penalties', 'income', 'late_fees', 'operating_income', 'credit', NULL, NULL, 0, 4200, 'Late fees and penalty income.'),
  ('4900', 'Discounts Given', 'income', 'contra_income', 'operating_income', 'credit', 'discounts_given', 'discounts_given', 1, 4900, 'Contra income for customer discounts.'),
  ('4990', 'Uncategorised Income', 'income', 'uncategorised_income', 'operating_income', 'credit', 'income.default', 'income.default', 1, 4990, 'Default income account for uncategorised receipts.'),
  ('5000', 'Fuel', 'expense', 'fuel', 'cost_of_revenue', 'debit', NULL, NULL, 0, 5000, 'Fuel for rental operations.'),
  ('5010', 'Driver Wages', 'expense', 'driver_wages', 'cost_of_revenue', 'debit', NULL, NULL, 0, 5010, 'Driver wages tied to services.'),
  ('5020', 'Repairs and Maintenance', 'expense', 'repairs_maintenance', 'cost_of_revenue', 'debit', NULL, NULL, 0, 5020, 'Repairs and maintenance for fleet and equipment.'),
  ('5030', 'Vehicle Insurance', 'expense', 'vehicle_insurance', 'cost_of_revenue', 'debit', NULL, NULL, 0, 5030, 'Vehicle insurance costs.'),
  ('5040', 'Vehicle Licensing and Roadworthy', 'expense', 'vehicle_licensing', 'cost_of_revenue', 'debit', NULL, NULL, 0, 5040, 'Vehicle licensing and roadworthy costs.'),
  ('5100', 'Laundry and Cleaning', 'expense', 'laundry_cleaning', 'cost_of_revenue', 'debit', NULL, NULL, 0, 5100, 'Laundry and cleaning for rental inventory.'),
  ('5110', 'Loss on Damaged Written-off Equipment', 'expense', 'damage_writeoff', 'cost_of_revenue', 'debit', 'expense.damage_writeoff', 'expense.damage_writeoff', 1, 5110, 'Write-off losses for damaged equipment.'),
  ('6000', 'Salaries and Wages', 'expense', 'salaries_wages', 'operating_expense', 'debit', NULL, NULL, 0, 6000, 'Administrative salaries and wages.'),
  ('6010', 'SSNIT Employer Contribution', 'expense', 'ssnit_employer', 'operating_expense', 'debit', NULL, NULL, 0, 6010, 'Employer SSNIT contribution expense.'),
  ('6100', 'Rent Yard and Warehouse', 'expense', 'rent', 'operating_expense', 'debit', NULL, NULL, 0, 6100, 'Yard and warehouse rent.'),
  ('6110', 'Electricity and Water', 'expense', 'utilities', 'operating_expense', 'debit', NULL, NULL, 0, 6110, 'Electricity and water costs.'),
  ('6120', 'Telephone and Internet', 'expense', 'telephone_internet', 'operating_expense', 'debit', NULL, NULL, 0, 6120, 'Telephone and internet costs.'),
  ('6200', 'Advertising and Marketing', 'expense', 'advertising_marketing', 'operating_expense', 'debit', NULL, NULL, 0, 6200, 'Advertising and marketing costs.'),
  ('6300', 'Office Supplies', 'expense', 'office_supplies', 'operating_expense', 'debit', NULL, NULL, 0, 6300, 'Office supplies.'),
  ('6400', 'Bank Charges and Mobile Money Fees', 'expense', 'bank_charges', 'operating_expense', 'debit', NULL, NULL, 0, 6400, 'Bank and mobile money charges.'),
  ('6500', 'Legal and Professional Fees', 'expense', 'professional_fees', 'operating_expense', 'debit', NULL, NULL, 0, 6500, 'Legal and professional fees.'),
  ('6600', 'Depreciation Expense', 'expense', 'depreciation', 'operating_expense', 'debit', 'expense.depreciation', 'expense.depreciation', 1, 6600, 'Depreciation expense.'),
  ('6900', 'Uncategorised Expense', 'expense', 'uncategorised_expense', 'operating_expense', 'debit', 'expense.default', 'expense.default', 1, 6900, 'Default expense account for uncategorised costs.'),
  ('7000', 'Other Income', 'income', 'other_income', 'other_income', 'credit', NULL, NULL, 0, 7000, 'Other non-operating income.'),
  ('7500', 'Interest Expense', 'expense', 'interest_expense', 'other_expense', 'debit', NULL, NULL, 0, 7500, 'Interest expense.')
ON CONFLICT(code) DO NOTHING;
