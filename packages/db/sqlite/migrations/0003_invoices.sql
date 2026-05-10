-- Phase 3 — invoices and payments.
--
-- Invoices are issued against bookings. Each invoice has line items that mirror
-- (or originate from) the booking lines, plus optional ad-hoc additions.
-- Payments — including deposits and refunds — settle the invoice.

CREATE TABLE IF NOT EXISTS invoices (
  id                 TEXT PRIMARY KEY NOT NULL,
  tenant_id          TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id         TEXT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  number             TEXT NOT NULL,                    -- human-readable, e.g. INV-000123
  status             TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'issued', 'paid', 'void')),
  issued_at          TEXT,                             -- set when status moves to 'issued'
  due_at             TEXT,
  subtotal_pesewas   INTEGER NOT NULL CHECK (subtotal_pesewas >= 0),
  tax_pesewas        INTEGER NOT NULL DEFAULT 0       CHECK (tax_pesewas >= 0),
  discount_pesewas   INTEGER NOT NULL DEFAULT 0       CHECK (discount_pesewas >= 0),
  total_pesewas      INTEGER NOT NULL CHECK (total_pesewas >= 0),
  notes              TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  deleted_at         TEXT,
  UNIQUE (tenant_id, number)
);

CREATE INDEX IF NOT EXISTS invoices_tenant_status_idx
  ON invoices (tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS invoices_booking_idx
  ON invoices (booking_id) WHERE deleted_at IS NULL;

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

CREATE INDEX IF NOT EXISTS invoice_lines_invoice_idx
  ON invoice_lines (invoice_id) WHERE deleted_at IS NULL;

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

CREATE INDEX IF NOT EXISTS payments_invoice_idx
  ON payments (invoice_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS payments_tenant_paid_at_idx
  ON payments (tenant_id, paid_at) WHERE deleted_at IS NULL;

-- Sequence for invoice numbers (per tenant). One row per tenant, atomic UPDATE.
CREATE TABLE IF NOT EXISTS invoice_sequences (
  tenant_id   TEXT PRIMARY KEY NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  next_value  INTEGER NOT NULL DEFAULT 1
);
