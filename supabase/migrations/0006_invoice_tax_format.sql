-- Phase 9 — invoice tax format + Ghana statutory tax breakdown (Supabase mirror).
--
-- See packages/db/sqlite/migrations/0009_invoice_tax_format.sql for the contract.

alter table public.invoices
  add column include_statutory_taxes boolean not null default true;

alter table public.invoices
  add column nhil_pesewas bigint not null default 0 check (nhil_pesewas >= 0);

alter table public.invoices
  add column getfund_pesewas bigint not null default 0 check (getfund_pesewas >= 0);

alter table public.invoices
  add column vat_pesewas bigint not null default 0 check (vat_pesewas >= 0);

alter table public.invoices
  add column initial_payment_percent integer not null default 50
    check (initial_payment_percent between 0 and 100);

alter table public.invoices
  add column before_delivery_percent integer not null default 50
    check (before_delivery_percent between 0 and 100);
