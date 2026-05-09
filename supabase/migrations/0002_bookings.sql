-- Phase 2 — bookings & scheduling (Supabase mirror).

create type public.booking_status as enum ('quote', 'reserved', 'out', 'returned', 'cancelled');

create table public.bookings (
  id                uuid primary key,
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  customer_id       uuid not null references public.customers(id) on delete restrict,
  status            public.booking_status not null default 'quote',
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  pickup_location   text,
  dropoff_location  text,
  driver_name       text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  check (starts_at < ends_at)
);

create index bookings_tenant_status_idx
  on public.bookings (tenant_id, status) where deleted_at is null;
create index bookings_tenant_window_idx
  on public.bookings (tenant_id, starts_at, ends_at) where deleted_at is null;
create index bookings_customer_idx
  on public.bookings (customer_id) where deleted_at is null;

create table public.booking_lines (
  id                  uuid primary key,
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  booking_id          uuid not null references public.bookings(id) on delete cascade,
  item_id             uuid not null references public.items(id) on delete restrict,
  item_unit_id        uuid references public.item_units(id) on delete restrict,
  quantity            integer not null check (quantity > 0),
  daily_rate_pesewas  bigint not null check (daily_rate_pesewas >= 0),
  odometer_start_km   integer check (odometer_start_km is null or odometer_start_km >= 0),
  odometer_end_km     integer check (odometer_end_km   is null or odometer_end_km   >= 0),
  fuel_litres_start   numeric(7,2) check (fuel_litres_start is null or fuel_litres_start >= 0),
  fuel_litres_end     numeric(7,2) check (fuel_litres_end   is null or fuel_litres_end   >= 0),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create index booking_lines_booking_idx
  on public.booking_lines (booking_id) where deleted_at is null;
create index booking_lines_item_idx
  on public.booking_lines (item_id) where deleted_at is null;
create index booking_lines_unit_idx
  on public.booking_lines (item_unit_id)
  where deleted_at is null and item_unit_id is not null;

alter table public.bookings      enable row level security;
alter table public.booking_lines enable row level security;

create policy bookings_tenant_member on public.bookings
  using (
    exists (select 1 from public.memberships m
            where m.tenant_id = bookings.tenant_id and m.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.memberships m
            where m.tenant_id = bookings.tenant_id and m.user_id = auth.uid())
  );

create policy booking_lines_tenant_member on public.booking_lines
  using (
    exists (select 1 from public.memberships m
            where m.tenant_id = booking_lines.tenant_id and m.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.memberships m
            where m.tenant_id = booking_lines.tenant_id and m.user_id = auth.uid())
  );
