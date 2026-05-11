-- Phase 4 - local auth, audit trail, and outbox/inbox sync plumbing.

CREATE TABLE IF NOT EXISTS app_users (
  id          TEXT PRIMARY KEY NOT NULL,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);

CREATE TABLE IF NOT EXISTS auth_state (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY NOT NULL,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id    TEXT REFERENCES app_users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  table_name  TEXT,
  record_id   TEXT,
  before_json TEXT,
  after_json  TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_log_tenant_created_idx ON audit_log (tenant_id, created_at);

CREATE TABLE IF NOT EXISTS sync_runtime_flags (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

INSERT INTO sync_runtime_flags (key, value)
VALUES ('suppress_outbox', '0')
ON CONFLICT(key) DO NOTHING;

CREATE TABLE IF NOT EXISTS outbox (
  id            TEXT PRIMARY KEY NOT NULL,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  table_name    TEXT NOT NULL,
  op            TEXT NOT NULL CHECK (op IN ('upsert', 'delete')),
  record_id     TEXT NOT NULL,
  payload       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'synced', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  created_at    TEXT NOT NULL,
  delivered_at  TEXT
);

CREATE INDEX IF NOT EXISTS outbox_status_created_idx ON outbox (status, created_at);
CREATE INDEX IF NOT EXISTS outbox_tenant_table_record_idx ON outbox (tenant_id, table_name, record_id);

CREATE TABLE IF NOT EXISTS changes_inbox (
  id          TEXT PRIMARY KEY NOT NULL,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  table_name  TEXT NOT NULL,
  op          TEXT NOT NULL CHECK (op IN ('upsert', 'delete')),
  record_id   TEXT NOT NULL,
  payload     TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  applied_at  TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS changes_inbox_pending_idx ON changes_inbox (tenant_id, applied_at, created_at);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id                TEXT PRIMARY KEY NOT NULL,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  table_name        TEXT NOT NULL,
  record_id         TEXT NOT NULL,
  local_payload     TEXT NOT NULL,
  remote_payload    TEXT NOT NULL,
  local_updated_at  TEXT NOT NULL,
  remote_updated_at TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'resolved_local', 'resolved_remote')),
  created_at        TEXT NOT NULL,
  resolved_at       TEXT
);

CREATE INDEX IF NOT EXISTS sync_conflicts_open_idx
  ON sync_conflicts (tenant_id, status, created_at);

CREATE TRIGGER IF NOT EXISTS items_outbox_insert
AFTER INSERT ON items
WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') != '1'
BEGIN
  INSERT INTO outbox (id, tenant_id, table_name, op, record_id, payload, created_at)
  VALUES (
    'items:' || NEW.id || ':i:' || strftime('%Y-%m-%dT%H:%M:%fZ','now') || ':' || lower(hex(randomblob(4))),
    NEW.tenant_id, 'items', 'upsert', NEW.id,
    json_object('id', NEW.id, 'tenant_id', NEW.tenant_id, 'kind', NEW.kind, 'sku', NEW.sku,
      'name', NEW.name, 'description', NEW.description, 'daily_rate_pesewas', NEW.daily_rate_pesewas,
      'replacement_value_pesewas', NEW.replacement_value_pesewas, 'total_quantity', NEW.total_quantity,
      'status', NEW.status, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
END;

CREATE TRIGGER IF NOT EXISTS items_outbox_update
AFTER UPDATE ON items
WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') != '1'
BEGIN
  INSERT INTO outbox (id, tenant_id, table_name, op, record_id, payload, created_at)
  VALUES (
    'items:' || NEW.id || ':u:' || strftime('%Y-%m-%dT%H:%M:%fZ','now') || ':' || lower(hex(randomblob(4))),
    NEW.tenant_id, 'items', 'upsert', NEW.id,
    json_object('id', NEW.id, 'tenant_id', NEW.tenant_id, 'kind', NEW.kind, 'sku', NEW.sku,
      'name', NEW.name, 'description', NEW.description, 'daily_rate_pesewas', NEW.daily_rate_pesewas,
      'replacement_value_pesewas', NEW.replacement_value_pesewas, 'total_quantity', NEW.total_quantity,
      'status', NEW.status, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
END;

CREATE TRIGGER IF NOT EXISTS item_units_outbox_insert
AFTER INSERT ON item_units
WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') != '1'
BEGIN
  INSERT INTO outbox (id, tenant_id, table_name, op, record_id, payload, created_at)
  VALUES (
    'item_units:' || NEW.id || ':i:' || strftime('%Y-%m-%dT%H:%M:%fZ','now') || ':' || lower(hex(randomblob(4))),
    NEW.tenant_id, 'item_units', 'upsert', NEW.id,
    json_object('id', NEW.id, 'tenant_id', NEW.tenant_id, 'item_id', NEW.item_id, 'identifier', NEW.identifier,
      'vin', NEW.vin, 'plate', NEW.plate, 'odometer_km', NEW.odometer_km, 'current_status', NEW.current_status,
      'notes', NEW.notes, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
END;

CREATE TRIGGER IF NOT EXISTS item_units_outbox_update
AFTER UPDATE ON item_units
WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') != '1'
BEGIN
  INSERT INTO outbox (id, tenant_id, table_name, op, record_id, payload, created_at)
  VALUES (
    'item_units:' || NEW.id || ':u:' || strftime('%Y-%m-%dT%H:%M:%fZ','now') || ':' || lower(hex(randomblob(4))),
    NEW.tenant_id, 'item_units', 'upsert', NEW.id,
    json_object('id', NEW.id, 'tenant_id', NEW.tenant_id, 'item_id', NEW.item_id, 'identifier', NEW.identifier,
      'vin', NEW.vin, 'plate', NEW.plate, 'odometer_km', NEW.odometer_km, 'current_status', NEW.current_status,
      'notes', NEW.notes, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
END;

CREATE TRIGGER IF NOT EXISTS customers_outbox_insert
AFTER INSERT ON customers
WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') != '1'
BEGIN
  INSERT INTO outbox (id, tenant_id, table_name, op, record_id, payload, created_at)
  VALUES (
    'customers:' || NEW.id || ':i:' || strftime('%Y-%m-%dT%H:%M:%fZ','now') || ':' || lower(hex(randomblob(4))),
    NEW.tenant_id, 'customers', 'upsert', NEW.id,
    json_object('id', NEW.id, 'tenant_id', NEW.tenant_id, 'name', NEW.name, 'phone', NEW.phone, 'email', NEW.email,
      'id_type', NEW.id_type, 'id_number', NEW.id_number, 'address', NEW.address, 'notes', NEW.notes,
      'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
END;

CREATE TRIGGER IF NOT EXISTS customers_outbox_update
AFTER UPDATE ON customers
WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') != '1'
BEGIN
  INSERT INTO outbox (id, tenant_id, table_name, op, record_id, payload, created_at)
  VALUES (
    'customers:' || NEW.id || ':u:' || strftime('%Y-%m-%dT%H:%M:%fZ','now') || ':' || lower(hex(randomblob(4))),
    NEW.tenant_id, 'customers', 'upsert', NEW.id,
    json_object('id', NEW.id, 'tenant_id', NEW.tenant_id, 'name', NEW.name, 'phone', NEW.phone, 'email', NEW.email,
      'id_type', NEW.id_type, 'id_number', NEW.id_number, 'address', NEW.address, 'notes', NEW.notes,
      'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
END;

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

CREATE TRIGGER IF NOT EXISTS invoice_lines_outbox_insert
AFTER INSERT ON invoice_lines
WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') != '1'
BEGIN
  INSERT INTO outbox (id, tenant_id, table_name, op, record_id, payload, created_at)
  VALUES (
    'invoice_lines:' || NEW.id || ':i:' || strftime('%Y-%m-%dT%H:%M:%fZ','now') || ':' || lower(hex(randomblob(4))),
    NEW.tenant_id, 'invoice_lines', 'upsert', NEW.id,
    json_object('id', NEW.id, 'tenant_id', NEW.tenant_id, 'invoice_id', NEW.invoice_id,
      'booking_line_id', NEW.booking_line_id, 'description', NEW.description, 'quantity', NEW.quantity, 'days', NEW.days,
      'unit_price_pesewas', NEW.unit_price_pesewas, 'line_total_pesewas', NEW.line_total_pesewas,
      'sort_order', NEW.sort_order, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
END;

CREATE TRIGGER IF NOT EXISTS invoice_lines_outbox_update
AFTER UPDATE ON invoice_lines
WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') != '1'
BEGIN
  INSERT INTO outbox (id, tenant_id, table_name, op, record_id, payload, created_at)
  VALUES (
    'invoice_lines:' || NEW.id || ':u:' || strftime('%Y-%m-%dT%H:%M:%fZ','now') || ':' || lower(hex(randomblob(4))),
    NEW.tenant_id, 'invoice_lines', 'upsert', NEW.id,
    json_object('id', NEW.id, 'tenant_id', NEW.tenant_id, 'invoice_id', NEW.invoice_id,
      'booking_line_id', NEW.booking_line_id, 'description', NEW.description, 'quantity', NEW.quantity, 'days', NEW.days,
      'unit_price_pesewas', NEW.unit_price_pesewas, 'line_total_pesewas', NEW.line_total_pesewas,
      'sort_order', NEW.sort_order, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
END;

CREATE TRIGGER IF NOT EXISTS payments_outbox_insert
AFTER INSERT ON payments
WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') != '1'
BEGIN
  INSERT INTO outbox (id, tenant_id, table_name, op, record_id, payload, created_at)
  VALUES (
    'payments:' || NEW.id || ':i:' || strftime('%Y-%m-%dT%H:%M:%fZ','now') || ':' || lower(hex(randomblob(4))),
    NEW.tenant_id, 'payments', 'upsert', NEW.id,
    json_object('id', NEW.id, 'tenant_id', NEW.tenant_id, 'invoice_id', NEW.invoice_id, 'kind', NEW.kind,
      'amount_pesewas', NEW.amount_pesewas, 'method', NEW.method, 'reference', NEW.reference, 'paid_at', NEW.paid_at,
      'notes', NEW.notes, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
END;

CREATE TRIGGER IF NOT EXISTS payments_outbox_update
AFTER UPDATE ON payments
WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') != '1'
BEGIN
  INSERT INTO outbox (id, tenant_id, table_name, op, record_id, payload, created_at)
  VALUES (
    'payments:' || NEW.id || ':u:' || strftime('%Y-%m-%dT%H:%M:%fZ','now') || ':' || lower(hex(randomblob(4))),
    NEW.tenant_id, 'payments', 'upsert', NEW.id,
    json_object('id', NEW.id, 'tenant_id', NEW.tenant_id, 'invoice_id', NEW.invoice_id, 'kind', NEW.kind,
      'amount_pesewas', NEW.amount_pesewas, 'method', NEW.method, 'reference', NEW.reference, 'paid_at', NEW.paid_at,
      'notes', NEW.notes, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
END;
