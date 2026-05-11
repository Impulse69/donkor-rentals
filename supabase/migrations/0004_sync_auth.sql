-- Phase 4 - auth profile metadata, sync conflict records, and audit trail.

alter table public.tenants
  add column if not exists currency text not null default 'GHS',
  add column if not exists locale text not null default 'en-GB',
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists logo_path text;

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  email       text not null,
  name        text not null,
  role        public.app_role not null default 'staff',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists profiles_tenant_idx
  on public.profiles (tenant_id) where deleted_at is null;

create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  actor_id    uuid references auth.users(id) on delete set null,
  action      text not null,
  table_name  text,
  record_id   uuid,
  before_json jsonb,
  after_json  jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists audit_log_tenant_created_idx
  on public.audit_log (tenant_id, created_at desc);

create table if not exists public.sync_conflicts (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  table_name        text not null,
  record_id         uuid not null,
  local_payload     jsonb not null,
  remote_payload    jsonb not null,
  local_updated_at  timestamptz not null,
  remote_updated_at timestamptz not null,
  status            text not null default 'open'
                    check (status in ('open', 'resolved_local', 'resolved_remote')),
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz
);

create index if not exists sync_conflicts_open_idx
  on public.sync_conflicts (tenant_id, status, created_at desc);

alter table public.profiles       enable row level security;
alter table public.audit_log      enable row level security;
alter table public.sync_conflicts enable row level security;

create policy profiles_tenant_member on public.profiles
  using (
    exists (select 1 from public.memberships m
            where m.tenant_id = profiles.tenant_id and m.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.memberships m
            where m.tenant_id = profiles.tenant_id and m.user_id = auth.uid())
  );

create policy audit_log_tenant_member on public.audit_log
  for select
  using (
    exists (select 1 from public.memberships m
            where m.tenant_id = audit_log.tenant_id and m.user_id = auth.uid())
  );

create policy audit_log_insert_member on public.audit_log
  for insert
  with check (
    exists (select 1 from public.memberships m
            where m.tenant_id = audit_log.tenant_id and m.user_id = auth.uid())
  );

create policy sync_conflicts_tenant_member on public.sync_conflicts
  using (
    exists (select 1 from public.memberships m
            where m.tenant_id = sync_conflicts.tenant_id and m.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.memberships m
            where m.tenant_id = sync_conflicts.tenant_id and m.user_id = auth.uid())
  );

create policy "tenants_insert_authenticated"
  on public.tenants
  for insert
  with check (auth.uid() is not null);

create policy "memberships_insert_self_owner"
  on public.memberships
  for insert
  with check (user_id = auth.uid() and role = 'owner');
