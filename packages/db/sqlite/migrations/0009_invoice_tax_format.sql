-- Phase 9 — invoice tax format + Ghana statutory tax breakdown.
--
-- Two-format invoice contract from customer-supplied PDF samples:
--   * Statutory (default): NHIL 2.5% + GETFund 2.5% + VAT 15% cascaded on subtotal.
--   * Simple: subtotal only, no statutory taxes.
--
-- Cascading formula (current Ghana standard since 2018):
--   nhil    = round(subtotal * 0.025)
--   getfund = round(subtotal * 0.025)
--   vat     = round((subtotal + nhil + getfund) * 0.15)
--   total   = subtotal + nhil + getfund + vat - discount
--
-- The legacy `tax_pesewas` column is preserved as a freeform additional tax
-- field — the new columns are the structured statutory breakdown.

ALTER TABLE invoices ADD COLUMN include_statutory_taxes INTEGER NOT NULL DEFAULT 1
  CHECK (include_statutory_taxes IN (0, 1));
ALTER TABLE invoices ADD COLUMN nhil_pesewas INTEGER NOT NULL DEFAULT 0
  CHECK (nhil_pesewas >= 0);
ALTER TABLE invoices ADD COLUMN getfund_pesewas INTEGER NOT NULL DEFAULT 0
  CHECK (getfund_pesewas >= 0);
ALTER TABLE invoices ADD COLUMN vat_pesewas INTEGER NOT NULL DEFAULT 0
  CHECK (vat_pesewas >= 0);
ALTER TABLE invoices ADD COLUMN initial_payment_percent INTEGER NOT NULL DEFAULT 50
  CHECK (initial_payment_percent BETWEEN 0 AND 100);
ALTER TABLE invoices ADD COLUMN before_delivery_percent INTEGER NOT NULL DEFAULT 50
  CHECK (before_delivery_percent BETWEEN 0 AND 100);
