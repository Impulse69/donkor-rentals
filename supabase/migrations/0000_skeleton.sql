-- Phase 0 skeleton. Real domain tables ship in Phase 1+.
--
-- Conventions used across the project:
--   * Every domain table has: id uuid PK, tenant_id uuid, created_at, updated_at, deleted_at.
--   * UUIDs are generated client-side so offline writes round-trip safely.
--   * Soft-delete only (deleted_at IS NULL filter on SELECT).
--   * RLS scoped by tenant_id via auth.jwt() -> 'tenant_id'.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Tenants table — single row in v1, multi-tenant ready.
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Memberships link auth users to a tenant + role.
create type public.app_role as enum ('owner', 'manager', 'staff');

create table if not exists public.memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role public.app_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);

alter table public.tenants enable row level security;
alter table public.memberships enable row level security;

create policy "tenants_select_member"
  on public.tenants
  for select
  using (
    exists (
      select 1 from public.memberships m
      where m.tenant_id = tenants.id and m.user_id = auth.uid()
    )
  );

create policy "memberships_select_self"
  on public.memberships
  for select
  using (user_id = auth.uid());
