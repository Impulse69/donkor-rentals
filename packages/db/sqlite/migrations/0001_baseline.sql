-- Offline baseline schema for Donkor & Sons Rentals.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tenants (
  id          TEXT PRIMARY KEY NOT NULL,
  name        TEXT NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'GHS' CHECK (currency = 'GHS'),
  locale      TEXT NOT NULL DEFAULT 'en-GB',
  address     TEXT,
  phone       TEXT,
  tin         TEXT,
  fiscal_year_start TEXT,
  logo_path   TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id                        TEXT PRIMARY KEY NOT NULL,
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind                      TEXT NOT NULL CHECK (kind IN ('party_supply', 'hearse')),
  sku                       TEXT NOT NULL,
  name                      TEXT NOT NULL,
  description               TEXT,
  daily_rate_pesewas        INTEGER NOT NULL CHECK (daily_rate_pesewas >= 0),
  replacement_value_pesewas INTEGER NOT NULL CHECK (replacement_value_pesewas >= 0),
  total_quantity            INTEGER NOT NULL CHECK (total_quantity >= 0),
  status                    TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL,
  deleted_at                TEXT,
  UNIQUE (tenant_id, sku)
);

CREATE INDEX IF NOT EXISTS items_tenant_kind_idx ON items (tenant_id, kind) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS items_tenant_name_idx ON items (tenant_id, name) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS item_units (
  id              TEXT PRIMARY KEY NOT NULL,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_id         TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  identifier      TEXT NOT NULL,
  vin             TEXT,
  plate           TEXT,
  odometer_km     INTEGER CHECK (odometer_km IS NULL OR odometer_km >= 0),
  current_status  TEXT NOT NULL DEFAULT 'available'
                    CHECK (current_status IN ('available', 'reserved', 'out', 'returned', 'damaged', 'retired')),
  notes           TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT,
  UNIQUE (tenant_id, item_id, identifier)
);

CREATE INDEX IF NOT EXISTS item_units_item_idx ON item_units (item_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS customers (
  id          TEXT PRIMARY KEY NOT NULL,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  id_type     TEXT CHECK (id_type IS NULL OR id_type IN ('ghana_card', 'voter_id', 'passport', 'drivers_license', 'other')),
  id_number   TEXT,
  address     TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);

CREATE INDEX IF NOT EXISTS customers_tenant_name_idx ON customers (tenant_id, name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS customers_tenant_phone_idx ON customers (tenant_id, phone) WHERE deleted_at IS NULL AND phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS bookings (
  id                TEXT PRIMARY KEY NOT NULL,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id       TEXT REFERENCES customers(id) ON DELETE SET NULL,
  renter_name       TEXT,
  status            TEXT NOT NULL DEFAULT 'quote'
                      CHECK (status IN ('quote', 'reserved', 'out', 'returned', 'cancelled')),
  starts_at         TEXT NOT NULL,
  ends_at           TEXT NOT NULL,
  pickup_location   TEXT,
  dropoff_location  TEXT,
  driver_name       TEXT,
  notes             TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  deleted_at        TEXT,
  CHECK (starts_at < ends_at)
);

CREATE INDEX IF NOT EXISTS bookings_tenant_status_idx ON bookings (tenant_id, status) WHERE deleted_at IS NULL;
-- Covers the conflict-detection query in repositories/bookings.ts (checkConflicts):
-- filters tenant_id, an overlapping starts_at/ends_at window, status IN (...), deleted_at IS NULL.
CREATE INDEX IF NOT EXISTS bookings_tenant_window_idx
  ON bookings (tenant_id, starts_at, ends_at, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS bookings_customer_idx ON bookings (customer_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS booking_lines (
  id                  TEXT PRIMARY KEY NOT NULL,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id          TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  item_id             TEXT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  item_unit_id        TEXT REFERENCES item_units(id) ON DELETE RESTRICT,
  quantity            INTEGER NOT NULL CHECK (quantity > 0),
  daily_rate_pesewas  INTEGER NOT NULL CHECK (daily_rate_pesewas >= 0),
  odometer_start_km   INTEGER CHECK (odometer_start_km IS NULL OR odometer_start_km >= 0),
  odometer_end_km     INTEGER CHECK (odometer_end_km IS NULL OR odometer_end_km >= 0),
  fuel_litres_start   INTEGER CHECK (fuel_litres_start IS NULL OR fuel_litres_start >= 0),
  fuel_litres_end     INTEGER CHECK (fuel_litres_end IS NULL OR fuel_litres_end >= 0),
  notes               TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT
);

CREATE INDEX IF NOT EXISTS booking_lines_booking_idx ON booking_lines (booking_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS booking_lines_item_idx ON booking_lines (item_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS booking_lines_unit_idx ON booking_lines (item_unit_id) WHERE deleted_at IS NULL AND item_unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS booking_lines_tenant_booking_idx ON booking_lines (tenant_id, booking_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS invoices (
  id                       TEXT PRIMARY KEY NOT NULL,
  tenant_id                TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id               TEXT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  number                   TEXT NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'paid', 'void')),
  issued_at                TEXT,
  due_at                   TEXT,
  subtotal_pesewas         INTEGER NOT NULL CHECK (subtotal_pesewas >= 0),
  tax_pesewas              INTEGER NOT NULL DEFAULT 0 CHECK (tax_pesewas >= 0),
  discount_pesewas         INTEGER NOT NULL DEFAULT 0 CHECK (discount_pesewas >= 0),
  total_pesewas            INTEGER NOT NULL CHECK (total_pesewas >= 0),
  include_statutory_taxes  INTEGER NOT NULL DEFAULT 1 CHECK (include_statutory_taxes IN (0, 1)),
  nhil_pesewas             INTEGER NOT NULL DEFAULT 0 CHECK (nhil_pesewas >= 0),
  getfund_pesewas          INTEGER NOT NULL DEFAULT 0 CHECK (getfund_pesewas >= 0),
  vat_pesewas              INTEGER NOT NULL DEFAULT 0 CHECK (vat_pesewas >= 0),
  initial_payment_percent  INTEGER NOT NULL DEFAULT 50 CHECK (initial_payment_percent BETWEEN 0 AND 100),
  before_delivery_percent  INTEGER NOT NULL DEFAULT 50 CHECK (before_delivery_percent BETWEEN 0 AND 100),
  notes                    TEXT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,
  deleted_at               TEXT,
  UNIQUE (tenant_id, number)
);

CREATE INDEX IF NOT EXISTS invoices_tenant_status_idx ON invoices (tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS invoices_booking_idx ON invoices (booking_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS invoices_tenant_booking_idx ON invoices (tenant_id, booking_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS invoice_lines (
  id                  TEXT PRIMARY KEY NOT NULL,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id          TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  booking_line_id     TEXT REFERENCES booking_lines(id) ON DELETE SET NULL,
  description         TEXT NOT NULL,
  quantity            INTEGER NOT NULL CHECK (quantity > 0),
  days                INTEGER NOT NULL CHECK (days > 0),
  unit_price_pesewas  INTEGER NOT NULL CHECK (unit_price_pesewas >= 0),
  line_total_pesewas  INTEGER NOT NULL CHECK (line_total_pesewas >= 0),
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT
);

CREATE INDEX IF NOT EXISTS invoice_lines_invoice_idx ON invoice_lines (invoice_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS invoice_sequences (
  tenant_id   TEXT PRIMARY KEY NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  next_value  INTEGER NOT NULL DEFAULT 1 CHECK (next_value > 0)
);

CREATE TABLE IF NOT EXISTS payments (
  id              TEXT PRIMARY KEY NOT NULL,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id      TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  kind            TEXT NOT NULL CHECK (kind IN ('deposit', 'payment', 'refund')),
  amount_pesewas  INTEGER NOT NULL CHECK (amount_pesewas > 0),
  method          TEXT NOT NULL CHECK (method IN ('cash', 'mobile_money', 'bank', 'card', 'other')),
  reference       TEXT,
  paid_at         TEXT NOT NULL,
  notes           TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT
);

CREATE INDEX IF NOT EXISTS payments_invoice_idx ON payments (invoice_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS payments_tenant_paid_at_idx ON payments (tenant_id, paid_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS returns (
  id                    TEXT PRIMARY KEY NOT NULL,
  tenant_id             TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id            TEXT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  returned_at           TEXT NOT NULL,
  received_by           TEXT,
  notes                 TEXT,
  deposit_pesewas       INTEGER NOT NULL CHECK (deposit_pesewas >= 0),
  total_charges_pesewas INTEGER NOT NULL CHECK (total_charges_pesewas >= 0),
  refund_pesewas        INTEGER NOT NULL CHECK (refund_pesewas >= 0),
  balance_due_pesewas   INTEGER NOT NULL CHECK (balance_due_pesewas >= 0),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  deleted_at            TEXT
);

CREATE INDEX IF NOT EXISTS returns_booking_idx ON returns (booking_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS returns_tenant_returned_idx ON returns (tenant_id, returned_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS returns_tenant_booking_idx ON returns (tenant_id, booking_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS damage_lines (
  id              TEXT PRIMARY KEY NOT NULL,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  return_id       TEXT NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  booking_line_id TEXT NOT NULL REFERENCES booking_lines(id) ON DELETE RESTRICT,
  item_id         TEXT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  item_unit_id    TEXT REFERENCES item_units(id) ON DELETE SET NULL,
  condition       TEXT NOT NULL CHECK (condition IN ('good', 'damaged', 'lost')),
  severity        TEXT CHECK (severity IS NULL OR severity IN ('minor', 'moderate', 'severe', 'write_off')),
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  description     TEXT,
  charge_pesewas  INTEGER NOT NULL CHECK (charge_pesewas >= 0),
  write_off       INTEGER NOT NULL DEFAULT 0 CHECK (write_off IN (0, 1)),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT
);

CREATE INDEX IF NOT EXISTS damage_lines_return_idx ON damage_lines (return_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS damage_lines_item_idx ON damage_lines (item_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS damage_photos (
  id              TEXT PRIMARY KEY NOT NULL,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  damage_line_id  TEXT NOT NULL REFERENCES damage_lines(id) ON DELETE CASCADE,
  storage_path    TEXT NOT NULL,
  caption         TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS damage_photos_line_idx ON damage_photos (damage_line_id);

CREATE TABLE IF NOT EXISTS documents (
  id            TEXT PRIMARY KEY NOT NULL,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_type   TEXT NOT NULL CHECK (source_type IN ('booking', 'invoice', 'payment', 'return')),
  source_id     TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('contract', 'invoice', 'receipt', 'trip_sheet')),
  title         TEXT NOT NULL,
  storage_path  TEXT,
  html          TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS documents_source_idx ON documents (tenant_id, source_type, source_id, created_at);

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO app_settings (key, value, updated_at)
VALUES
  ('update_channel', 'latest', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('crash_reporting_enabled', '0', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('sentry_dsn', '', strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(key) DO NOTHING;

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY NOT NULL,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id    TEXT,
  action      TEXT NOT NULL,
  table_name  TEXT,
  record_id   TEXT,
  before_json TEXT,
  after_json  TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_log_tenant_created_idx ON audit_log (tenant_id, created_at);

CREATE TABLE IF NOT EXISTS _migrations (
  id          TEXT PRIMARY KEY NOT NULL,
  applied_at  TEXT NOT NULL
);
