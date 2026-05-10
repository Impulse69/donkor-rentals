-- Phase 3 — invoices + payments (Supabase mirror).

create type public.invoice_status as enum ('draft', 'issued', 'paid', 'void');
create type public.payment_kind   as enum ('deposit', 'payment', 'refund');
create type public.payment_method as enum ('cash', 'mobile_money', 'bank', 'card', 'other');

create table public.invoices (
  id                 uuid primary key,
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  booking_id         uuid not null references public.bookings(id) on delete restrict,
  number             text not null,
  status             public.invoice_status not null default 'draft',
  issued_at          timestamptz,
  due_at             timestamptz,
  subtotal_pesewas   bigint not null check (subtotal_pesewas >= 0),
  tax_pesewas        bigint not null default 0 check (tax_pesewas >= 0),
  discount_pesewas   bigint not null default 0 check (discount_pesewas >= 0),
  total_pesewas      bigint not null check (total_pesewas >= 0),
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  unique (tenant_id, number)
);

create index invoices_tenant_status_idx
  on public.invoices (tenant_id, status) where deleted_at is null;
create index invoices_booking_idx
  on public.invoices (booking_id) where deleted_at is null;

create table public.invoice_lines (
  id                  uuid primary key,
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  invoice_id          uuid not null references public.invoices(id) on delete cascade,
  booking_line_id     uuid references public.booking_lines(id) on delete set null,
  description         text not null,
  quantity            integer not null check (quantity > 0),
  days                integer not null check (days > 0),
  unit_price_pesewas  bigint not null check (unit_price_pesewas >= 0),
  line_total_pesewas  bigint not null check (line_total_pesewas >= 0),
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create index invoice_lines_invoice_idx
  on public.invoice_lines (invoice_id) where deleted_at is null;

create table public.payments (
  id              uuid primary key,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  invoice_id      uuid not null references public.invoices(id) on delete restrict,
  kind            public.payment_kind not null,
  amount_pesewas  bigint not null check (amount_pesewas > 0),
  method          public.payment_method not null,
  reference       text,
  paid_at         timestamptz not null,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index payments_invoice_idx
  on public.payments (invoice_id) where deleted_at is null;
create index payments_tenant_paid_at_idx
  on public.payments (tenant_id, paid_at) where deleted_at is null;

create table public.invoice_sequences (
  tenant_id   uuid primary key references public.tenants(id) on delete cascade,
  next_value  integer not null default 1
);

alter table public.invoices          enable row level security;
alter table public.invoice_lines     enable row level security;
alter table public.payments          enable row level security;
alter table public.invoice_sequences enable row level security;

create policy invoices_tenant_member on public.invoices
  using (
    exists (select 1 from public.memberships m
            where m.tenant_id = invoices.tenant_id and m.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.memberships m
            where m.tenant_id = invoices.tenant_id and m.user_id = auth.uid())
  );
create policy invoice_lines_tenant_member on public.invoice_lines
  using (
    exists (select 1 from public.memberships m
            where m.tenant_id = invoice_lines.tenant_id and m.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.memberships m
            where m.tenant_id = invoice_lines.tenant_id and m.user_id = auth.uid())
  );
create policy payments_tenant_member on public.payments
  using (
    exists (select 1 from public.memberships m
            where m.tenant_id = payments.tenant_id and m.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.memberships m
            where m.tenant_id = payments.tenant_id and m.user_id = auth.uid())
  );
create policy invoice_sequences_tenant_member on public.invoice_sequences
  using (
    exists (select 1 from public.memberships m
            where m.tenant_id = invoice_sequences.tenant_id and m.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.memberships m
            where m.tenant_id = invoice_sequences.tenant_id and m.user_id = auth.uid())
  );
