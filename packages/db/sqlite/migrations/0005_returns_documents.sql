-- Phase 5 - return flow, damage/loss reconciliation, photo metadata, and document archives.

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

CREATE TRIGGER IF NOT EXISTS damage_lines_outbox_insert
AFTER INSERT ON damage_lines
WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') != '1'
BEGIN
  INSERT INTO outbox (id, tenant_id, table_name, op, record_id, payload, created_at)
  VALUES (
    'damage_lines:' || NEW.id || ':i:' || strftime('%Y-%m-%dT%H:%M:%fZ','now') || ':' || lower(hex(randomblob(4))),
    NEW.tenant_id, 'damage_lines', 'upsert', NEW.id,
    json_object('id', NEW.id, 'tenant_id', NEW.tenant_id, 'return_id', NEW.return_id,
      'booking_line_id', NEW.booking_line_id, 'item_id', NEW.item_id, 'item_unit_id', NEW.item_unit_id,
      'condition', NEW.condition, 'severity', NEW.severity, 'quantity', NEW.quantity,
      'description', NEW.description, 'charge_pesewas', NEW.charge_pesewas, 'write_off', NEW.write_off,
      'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
END;

CREATE TRIGGER IF NOT EXISTS damage_lines_outbox_update
AFTER UPDATE ON damage_lines
WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') != '1'
BEGIN
  INSERT INTO outbox (id, tenant_id, table_name, op, record_id, payload, created_at)
  VALUES (
    'damage_lines:' || NEW.id || ':u:' || strftime('%Y-%m-%dT%H:%M:%fZ','now') || ':' || lower(hex(randomblob(4))),
    NEW.tenant_id, 'damage_lines', 'upsert', NEW.id,
    json_object('id', NEW.id, 'tenant_id', NEW.tenant_id, 'return_id', NEW.return_id,
      'booking_line_id', NEW.booking_line_id, 'item_id', NEW.item_id, 'item_unit_id', NEW.item_unit_id,
      'condition', NEW.condition, 'severity', NEW.severity, 'quantity', NEW.quantity,
      'description', NEW.description, 'charge_pesewas', NEW.charge_pesewas, 'write_off', NEW.write_off,
      'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
END;

CREATE TRIGGER IF NOT EXISTS damage_photos_outbox_insert
AFTER INSERT ON damage_photos
WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') != '1'
BEGIN
  INSERT INTO outbox (id, tenant_id, table_name, op, record_id, payload, created_at)
  VALUES (
    'damage_photos:' || NEW.id || ':i:' || strftime('%Y-%m-%dT%H:%M:%fZ','now') || ':' || lower(hex(randomblob(4))),
    NEW.tenant_id, 'damage_photos', 'upsert', NEW.id,
    json_object('id', NEW.id, 'tenant_id', NEW.tenant_id, 'damage_line_id', NEW.damage_line_id,
      'storage_path', NEW.storage_path, 'caption', NEW.caption, 'created_at', NEW.created_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
END;

CREATE TRIGGER IF NOT EXISTS documents_outbox_insert
AFTER INSERT ON documents
WHEN COALESCE((SELECT value FROM sync_runtime_flags WHERE key = 'suppress_outbox'), '0') != '1'
BEGIN
  INSERT INTO outbox (id, tenant_id, table_name, op, record_id, payload, created_at)
  VALUES (
    'documents:' || NEW.id || ':i:' || strftime('%Y-%m-%dT%H:%M:%fZ','now') || ':' || lower(hex(randomblob(4))),
    NEW.tenant_id, 'documents', 'upsert', NEW.id,
    json_object('id', NEW.id, 'tenant_id', NEW.tenant_id, 'source_type', NEW.source_type, 'source_id', NEW.source_id,
      'kind', NEW.kind, 'title', NEW.title, 'storage_path', NEW.storage_path, 'html', NEW.html, 'created_at', NEW.created_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
END;
