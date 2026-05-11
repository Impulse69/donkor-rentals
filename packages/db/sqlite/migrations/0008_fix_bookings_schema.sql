PRAGMA foreign_keys = OFF;

-- RECREATE booking_lines
CREATE TABLE booking_lines_new (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id          TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  item_id             TEXT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  item_unit_id        TEXT REFERENCES item_units(id) ON DELETE RESTRICT,
  quantity            INTEGER NOT NULL CHECK (quantity > 0),
  daily_rate_pesewas  INTEGER NOT NULL,
  odometer_start_km   INTEGER,
  odometer_end_km     INTEGER,
  fuel_litres_start   INTEGER,
  fuel_litres_end     INTEGER,
  notes               TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT
);
INSERT INTO booking_lines_new SELECT * FROM booking_lines;
DROP TABLE booking_lines;
ALTER TABLE booking_lines_new RENAME TO booking_lines;
CREATE INDEX IF NOT EXISTS booking_lines_tenant_booking_idx ON booking_lines (tenant_id, booking_id) WHERE deleted_at IS NULL;

-- RECREATE invoices
CREATE TABLE invoices_new (
  id                 TEXT PRIMARY KEY,
  tenant_id          TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id         TEXT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  number             TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('draft', 'issued', 'paid', 'void')),
  issued_at          TEXT,
  due_at             TEXT,
  subtotal_pesewas   INTEGER NOT NULL,
  tax_pesewas        INTEGER NOT NULL,
  discount_pesewas   INTEGER NOT NULL,
  total_pesewas      INTEGER NOT NULL,
  notes              TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  deleted_at         TEXT
);
INSERT INTO invoices_new SELECT * FROM invoices;
DROP TABLE invoices;
ALTER TABLE invoices_new RENAME TO invoices;
CREATE INDEX IF NOT EXISTS invoices_tenant_booking_idx ON invoices (tenant_id, booking_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS invoices_tenant_status_idx ON invoices (tenant_id, status) WHERE deleted_at IS NULL;

-- RECREATE returns
CREATE TABLE returns_new (
  id                    TEXT PRIMARY KEY,
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
INSERT INTO returns_new SELECT * FROM returns;
DROP TABLE returns;
ALTER TABLE returns_new RENAME TO returns;
CREATE INDEX IF NOT EXISTS returns_tenant_booking_idx ON returns (tenant_id, booking_id) WHERE deleted_at IS NULL;

-- RECREATE TRIGGERS

-- bookings
CREATE TRIGGER IF NOT EXISTS bookings_outbox_insert
AFTER INSERT ON bookings
WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') != '1'
BEGIN
  INSERT INTO outbox (id, tenant_id, table_name, op, record_id, payload, created_at)
  VALUES (
    'bookings:' || NEW.id || ':i:' || strftime('%Y-%m-%dT%H:%M:%fZ','now') || ':' || lower(hex(randomblob(4))),
    NEW.tenant_id, 'bookings', 'upsert', NEW.id,
    json_object('id', NEW.id, 'tenant_id', NEW.tenant_id, 'customer_id', NEW.customer_id, 'status', NEW.status,
      'starts_at', NEW.starts_at, 'ends_at', NEW.ends_at, 'pickup_location', NEW.pickup_location,
      'dropoff_location', NEW.dropoff_location, 'driver_name', NEW.driver_name, 'notes', NEW.notes,
      'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
END;

CREATE TRIGGER IF NOT EXISTS bookings_outbox_update
AFTER UPDATE ON bookings
WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') != '1'
BEGIN
  INSERT INTO outbox (id, tenant_id, table_name, op, record_id, payload, created_at)
  VALUES (
    'bookings:' || NEW.id || ':u:' || strftime('%Y-%m-%dT%H:%M:%fZ','now') || ':' || lower(hex(randomblob(4))),
    NEW.tenant_id, 'bookings', 'upsert', NEW.id,
    json_object('id', NEW.id, 'tenant_id', NEW.tenant_id, 'customer_id', NEW.customer_id, 'status', NEW.status,
      'starts_at', NEW.starts_at, 'ends_at', NEW.ends_at, 'pickup_location', NEW.pickup_location,
      'dropoff_location', NEW.dropoff_location, 'driver_name', NEW.driver_name, 'notes', NEW.notes,
      'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
END;

-- booking_lines
CREATE TRIGGER IF NOT EXISTS booking_lines_outbox_insert
AFTER INSERT ON booking_lines
WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') != '1'
BEGIN
  INSERT INTO outbox (id, tenant_id, table_name, op, record_id, payload, created_at)
  VALUES (
    'booking_lines:' || NEW.id || ':i:' || strftime('%Y-%m-%dT%H:%M:%fZ','now') || ':' || lower(hex(randomblob(4))),
    NEW.tenant_id, 'booking_lines', 'upsert', NEW.id,
    json_object('id', NEW.id, 'tenant_id', NEW.tenant_id, 'booking_id', NEW.booking_id, 'item_id', NEW.item_id,
      'item_unit_id', NEW.item_unit_id, 'quantity', NEW.quantity, 'daily_rate_pesewas', NEW.daily_rate_pesewas,
      'odometer_start_km', NEW.odometer_start_km, 'odometer_end_km', NEW.odometer_end_km,
      'fuel_litres_start', NEW.fuel_litres_start, 'fuel_litres_end', NEW.fuel_litres_end, 'notes', NEW.notes,
      'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
END;

CREATE TRIGGER IF NOT EXISTS booking_lines_outbox_update
AFTER UPDATE ON booking_lines
WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') != '1'
BEGIN
  INSERT INTO outbox (id, tenant_id, table_name, op, record_id, payload, created_at)
  VALUES (
    'booking_lines:' || NEW.id || ':u:' || strftime('%Y-%m-%dT%H:%M:%fZ','now') || ':' || lower(hex(randomblob(4))),
    NEW.tenant_id, 'booking_lines', 'upsert', NEW.id,
    json_object('id', NEW.id, 'tenant_id', NEW.tenant_id, 'booking_id', NEW.booking_id, 'item_id', NEW.item_id,
      'item_unit_id', NEW.item_unit_id, 'quantity', NEW.quantity, 'daily_rate_pesewas', NEW.daily_rate_pesewas,
      'odometer_start_km', NEW.odometer_start_km, 'odometer_end_km', NEW.odometer_end_km,
      'fuel_litres_start', NEW.fuel_litres_start, 'fuel_litres_end', NEW.fuel_litres_end, 'notes', NEW.notes,
      'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
END;

-- invoices
CREATE TRIGGER IF NOT EXISTS invoices_outbox_insert
AFTER INSERT ON invoices
WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') != '1'
BEGIN
  INSERT INTO outbox (id, tenant_id, table_name, op, record_id, payload, created_at)
  VALUES (
    'invoices:' || NEW.id || ':i:' || strftime('%Y-%m-%dT%H:%M:%fZ','now') || ':' || lower(hex(randomblob(4))),
    NEW.tenant_id, 'invoices', 'upsert', NEW.id,
    json_object('id', NEW.id, 'tenant_id', NEW.tenant_id, 'booking_id', NEW.booking_id, 'number', NEW.number,
      'status', NEW.status, 'issued_at', NEW.issued_at, 'due_at', NEW.due_at, 'subtotal_pesewas', NEW.subtotal_pesewas,
      'tax_pesewas', NEW.tax_pesewas, 'discount_pesewas', NEW.discount_pesewas, 'total_pesewas', NEW.total_pesewas,
      'notes', NEW.notes, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
END;

CREATE TRIGGER IF NOT EXISTS invoices_outbox_update
AFTER UPDATE ON invoices
WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') != '1'
BEGIN
  INSERT INTO outbox (id, tenant_id, table_name, op, record_id, payload, created_at)
  VALUES (
    'invoices:' || NEW.id || ':u:' || strftime('%Y-%m-%dT%H:%M:%fZ','now') || ':' || lower(hex(randomblob(4))),
    NEW.tenant_id, 'invoices', 'upsert', NEW.id,
    json_object('id', NEW.id, 'tenant_id', NEW.tenant_id, 'booking_id', NEW.booking_id, 'number', NEW.number,
      'status', NEW.status, 'issued_at', NEW.issued_at, 'due_at', NEW.due_at, 'subtotal_pesewas', NEW.subtotal_pesewas,
      'tax_pesewas', NEW.tax_pesewas, 'discount_pesewas', NEW.discount_pesewas, 'total_pesewas', NEW.total_pesewas,
      'notes', NEW.notes, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
END;

-- returns
CREATE TRIGGER IF NOT EXISTS returns_outbox_insert
AFTER INSERT ON returns
WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') != '1'
BEGIN
  INSERT INTO outbox (id, tenant_id, table_name, op, record_id, payload, created_at)
  VALUES (
    'returns:' || NEW.id || ':i:' || strftime('%Y-%m-%dT%H:%M:%fZ','now') || ':' || lower(hex(randomblob(4))),
    NEW.tenant_id, 'returns', 'upsert', NEW.id,
    json_object('id', NEW.id, 'tenant_id', NEW.tenant_id, 'booking_id', NEW.booking_id,
      'returned_at', NEW.returned_at, 'received_by', NEW.received_by, 'notes', NEW.notes,
      'deposit_pesewas', NEW.deposit_pesewas, 'total_charges_pesewas', NEW.total_charges_pesewas,
      'refund_pesewas', NEW.refund_pesewas, 'balance_due_pesewas', NEW.balance_due_pesewas,
      'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
END;

CREATE TRIGGER IF NOT EXISTS returns_outbox_update
AFTER UPDATE ON returns
WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') != '1'
BEGIN
  INSERT INTO outbox (id, tenant_id, table_name, op, record_id, payload, created_at)
  VALUES (
    'returns:' || NEW.id || ':u:' || strftime('%Y-%m-%dT%H:%M:%fZ','now') || ':' || lower(hex(randomblob(4))),
    NEW.tenant_id, 'returns', 'upsert', NEW.id,
    json_object('id', NEW.id, 'tenant_id', NEW.tenant_id, 'booking_id', NEW.booking_id,
      'returned_at', NEW.returned_at, 'received_by', NEW.received_by, 'notes', NEW.notes,
      'deposit_pesewas', NEW.deposit_pesewas, 'total_charges_pesewas', NEW.total_charges_pesewas,
      'refund_pesewas', NEW.refund_pesewas, 'balance_due_pesewas', NEW.balance_due_pesewas,
      'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
END;

PRAGMA foreign_keys = ON;
