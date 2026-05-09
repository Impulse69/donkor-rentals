-- Phase 2 — bookings & scheduling.
--
-- A booking is a hold on inventory for a customer over a time window.
-- Lines bind specific items (and units, for hearses) to the booking.
--
-- Status lifecycle: quote → reserved → out → returned, or cancelled at any
-- point before "out". We never hard-delete; cancelled rows still occupy
-- conflict-detection space until they hit `cancelled`.

CREATE TABLE IF NOT EXISTS bookings (
  id                TEXT PRIMARY KEY NOT NULL,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id       TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  status            TEXT NOT NULL DEFAULT 'quote'
                      CHECK (status IN ('quote', 'reserved', 'out', 'returned', 'cancelled')),
  starts_at         TEXT NOT NULL,   -- ISO 8601 with offset
  ends_at           TEXT NOT NULL,   -- exclusive end
  pickup_location   TEXT,
  dropoff_location  TEXT,
  driver_name       TEXT,            -- hearse bookings: assigned driver
  notes             TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  deleted_at        TEXT,
  CHECK (starts_at < ends_at)
);

CREATE INDEX IF NOT EXISTS bookings_tenant_status_idx
  ON bookings (tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS bookings_tenant_window_idx
  ON bookings (tenant_id, starts_at, ends_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS bookings_customer_idx
  ON bookings (customer_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS booking_lines (
  id                  TEXT PRIMARY KEY NOT NULL,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id          TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  item_id             TEXT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  item_unit_id        TEXT REFERENCES item_units(id) ON DELETE RESTRICT,
  quantity            INTEGER NOT NULL CHECK (quantity > 0),
  daily_rate_pesewas  INTEGER NOT NULL CHECK (daily_rate_pesewas >= 0),
  -- Hearse-only operational fields, captured at check-out / check-in.
  odometer_start_km   INTEGER CHECK (odometer_start_km IS NULL OR odometer_start_km >= 0),
  odometer_end_km     INTEGER CHECK (odometer_end_km IS NULL OR odometer_end_km >= 0),
  fuel_litres_start   REAL    CHECK (fuel_litres_start IS NULL OR fuel_litres_start >= 0),
  fuel_litres_end     REAL    CHECK (fuel_litres_end IS NULL OR fuel_litres_end >= 0),
  notes               TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT
);

CREATE INDEX IF NOT EXISTS booking_lines_booking_idx
  ON booking_lines (booking_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS booking_lines_item_idx
  ON booking_lines (item_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS booking_lines_unit_idx
  ON booking_lines (item_unit_id) WHERE deleted_at IS NULL AND item_unit_id IS NOT NULL;
