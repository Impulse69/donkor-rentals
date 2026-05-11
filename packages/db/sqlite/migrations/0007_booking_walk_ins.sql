-- Allow rentals without a saved customer file.

PRAGMA foreign_keys = OFF;
PRAGMA legacy_alter_table = ON;

ALTER TABLE bookings RENAME TO bookings_old;

CREATE TABLE bookings (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id      TEXT REFERENCES customers(id) ON DELETE SET NULL,
  renter_name      TEXT,
  status           TEXT NOT NULL CHECK (status IN ('quote','reserved','out','returned','cancelled')),
  starts_at        TEXT NOT NULL,
  ends_at          TEXT NOT NULL,
  pickup_location  TEXT,
  dropoff_location TEXT,
  driver_name      TEXT,
  notes            TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  deleted_at       TEXT
);

INSERT INTO bookings (
  id, tenant_id, customer_id, renter_name, status, starts_at, ends_at,
  pickup_location, dropoff_location, driver_name, notes, created_at, updated_at, deleted_at
)
SELECT
  b.id, b.tenant_id, b.customer_id, c.name, b.status, b.starts_at, b.ends_at,
  b.pickup_location, b.dropoff_location, b.driver_name, b.notes, b.created_at, b.updated_at, b.deleted_at
FROM bookings_old b
LEFT JOIN customers c ON c.id = b.customer_id;

DROP TABLE bookings_old;

CREATE INDEX IF NOT EXISTS idx_bookings_tenant_window
  ON bookings(tenant_id, starts_at, ends_at, status);
CREATE INDEX IF NOT EXISTS idx_bookings_customer
  ON bookings(customer_id);

PRAGMA legacy_alter_table = OFF;
PRAGMA foreign_keys = ON;
