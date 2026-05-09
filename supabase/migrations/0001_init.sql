-- Phase 1 — initial schema in Supabase. Mirrors packages/db/sqlite/migrations/0001_init.sql
-- with Postgres types + RLS policies scoped by tenant_id (resolved via memberships).

create extension if not exists "pgcrypto";

create type public.item_kind as enum ('party_supply', 'hearse');
create type public.item_status as enum ('active', 'retired');
create type public.item_unit_status as enum (
  'available', 'reserved', 'out', 'returned', 'damaged', 'retired'
);
create type public.customer_id_type as enum (
  'ghana_card', 'voter_id', 'passport', 'drivers_license', 'other'
);

create table public.items (
  id                         uuid primary key,
  tenant_id                  uuid not null references public.tenants(id) on delete cascade,
  kind                       public.item_kind not null,
  sku                        text not null,
  name                       text not null,
  description                text,
  daily_rate_pesewas         bigint not null check (daily_rate_pesewas >= 0),
  replacement_value_pesewas  bigint not null check (replacement_value_pesewas >= 0),
  total_quantity             integer not null check (total_quantity >= 0),
  status                     public.item_status not null default 'active',
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  deleted_at                 timestamptz,
  unique (tenant_id, sku)
);

create index items_tenant_kind_idx
  on public.items (tenant_id, kind) where deleted_at is null;
create index items_tenant_name_idx
  on public.items (tenant_id, name) where deleted_at is null;

create table public.item_units (
  id              uuid primary key,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  item_id         uuid not null references public.items(id) on delete cascade,
  identifier      text not null,
  vin             text,
  plate           text,
  odometer_km     integer check (odometer_km is null or odometer_km >= 0),
  current_status  public.item_unit_status not null default 'available',
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (tenant_id, item_id, identifier)
);

create index item_units_item_idx
  on public.item_units (item_id) where deleted_at is null;

create table public.customers (
  id          uuid primary key,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  phone       text,
  email       text,
  id_type     public.customer_id_type,
  id_number   text,
  address     text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index customers_tenant_name_idx
  on public.customers (tenant_id, name) where deleted_at is null;
create index customers_tenant_phone_idx
  on public.customers (tenant_id, phone) where deleted_at is null and phone is not null;

-- RLS: scope every row by tenant via memberships.
alter table public.items      enable row level security;
alter table public.item_units enable row level security;
alter table public.customers  enable row level security;

create policy items_tenant_member on public.items
  using (
    exists (select 1 from public.memberships m
            where m.tenant_id = items.tenant_id and m.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.memberships m
            where m.tenant_id = items.tenant_id and m.user_id = auth.uid())
  );

create policy item_units_tenant_member on public.item_units
  using (
    exists (select 1 from public.memberships m
            where m.tenant_id = item_units.tenant_id and m.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.memberships m
            where m.tenant_id = item_units.tenant_id and m.user_id = auth.uid())
  );

create policy customers_tenant_member on public.customers
  using (
    exists (select 1 from public.memberships m
            where m.tenant_id = customers.tenant_id and m.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.memberships m
            where m.tenant_id = customers.tenant_id and m.user_id = auth.uid())
  );
