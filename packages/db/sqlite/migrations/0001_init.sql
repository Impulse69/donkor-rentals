-- Phase 1 — initial schema for catalog + customers (offline-only).
-- Conventions:
--   * Every domain table: id TEXT (UUID v4), tenant_id TEXT, created_at, updated_at, deleted_at (nullable).
--   * Soft delete only — every SELECT must filter `deleted_at IS NULL`.
--   * UUIDs generated client-side.
--   * Money in pesewas (integer). 1 GHS = 100 pesewas.
--   * SQLite has no enum — use CHECK constraints.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tenants (
  id          TEXT PRIMARY KEY NOT NULL,
  name        TEXT NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'GHS',
  locale      TEXT NOT NULL DEFAULT 'en-GB',
  address     TEXT,
  phone       TEXT,
  logo_path   TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id                       TEXT PRIMARY KEY NOT NULL,
  tenant_id                TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind                     TEXT NOT NULL CHECK (kind IN ('party_supply', 'hearse')),
  sku                      TEXT NOT NULL,
  name                     TEXT NOT NULL,
  description              TEXT,
  daily_rate_pesewas       INTEGER NOT NULL CHECK (daily_rate_pesewas >= 0),
  replacement_value_pesewas INTEGER NOT NULL CHECK (replacement_value_pesewas >= 0),
  total_quantity           INTEGER NOT NULL CHECK (total_quantity >= 0),
  status                   TEXT NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'retired')),
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,
  deleted_at               TEXT,
  UNIQUE (tenant_id, sku)
);

CREATE INDEX IF NOT EXISTS items_tenant_kind_idx ON items (tenant_id, kind) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS items_tenant_name_idx ON items (tenant_id, name) WHERE deleted_at IS NULL;

-- Per-unit tracking. Used for hearses (unique vehicles); party-supply pools usually have
-- zero rows here and are tracked solely by total_quantity.
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

-- Schema version stamp used by the migration runner.
CREATE TABLE IF NOT EXISTS _migrations (
  id           TEXT PRIMARY KEY NOT NULL,
  applied_at   TEXT NOT NULL
);
