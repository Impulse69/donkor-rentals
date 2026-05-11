-- Phase 5 - returns, damage reconciliation, photo metadata, document archives.

create type public.return_condition as enum ('good', 'damaged', 'lost');
create type public.damage_severity as enum ('minor', 'moderate', 'severe', 'write_off');
create type public.document_kind as enum ('contract', 'invoice', 'receipt', 'trip_sheet');
create type public.document_source_type as enum ('booking', 'invoice', 'payment', 'return');

create table public.returns (
  id                    uuid primary key,
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  booking_id            uuid not null references public.bookings(id) on delete restrict,
  returned_at           timestamptz not null,
  received_by           text,
  notes                 text,
  deposit_pesewas       bigint not null check (deposit_pesewas >= 0),
  total_charges_pesewas bigint not null check (total_charges_pesewas >= 0),
  refund_pesewas        bigint not null check (refund_pesewas >= 0),
  balance_due_pesewas   bigint not null check (balance_due_pesewas >= 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

create index returns_booking_idx on public.returns (booking_id) where deleted_at is null;
create index returns_tenant_returned_idx on public.returns (tenant_id, returned_at) where deleted_at is null;

create table public.damage_lines (
  id              uuid primary key,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  return_id       uuid not null references public.returns(id) on delete cascade,
  booking_line_id uuid not null references public.booking_lines(id) on delete restrict,
  item_id         uuid not null references public.items(id) on delete restrict,
  item_unit_id    uuid references public.item_units(id) on delete set null,
  condition       public.return_condition not null,
  severity        public.damage_severity,
  quantity        integer not null check (quantity > 0),
  description     text,
  charge_pesewas  bigint not null check (charge_pesewas >= 0),
  write_off       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index damage_lines_return_idx on public.damage_lines (return_id) where deleted_at is null;
create index damage_lines_item_idx on public.damage_lines (item_id) where deleted_at is null;

create table public.damage_photos (
  id              uuid primary key,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  damage_line_id  uuid not null references public.damage_lines(id) on delete cascade,
  storage_path    text not null,
  caption         text,
  created_at      timestamptz not null default now()
);

create index damage_photos_line_idx on public.damage_photos (damage_line_id);

create table public.documents (
  id            uuid primary key,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  source_type   public.document_source_type not null,
  source_id     uuid not null,
  kind          public.document_kind not null,
  title         text not null,
  storage_path  text,
  html          text not null,
  created_at    timestamptz not null default now()
);

create index documents_source_idx on public.documents (tenant_id, source_type, source_id, created_at desc);

insert into storage.buckets (id, name, public)
values ('damage-photos', 'damage-photos', false),
       ('documents', 'documents', false)
on conflict (id) do nothing;

alter table public.returns       enable row level security;
alter table public.damage_lines  enable row level security;
alter table public.damage_photos enable row level security;
alter table public.documents     enable row level security;

create policy returns_tenant_member on public.returns
  using (
    exists (select 1 from public.memberships m
            where m.tenant_id = returns.tenant_id and m.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.memberships m
            where m.tenant_id = returns.tenant_id and m.user_id = auth.uid())
  );

create policy damage_lines_tenant_member on public.damage_lines
  using (
    exists (select 1 from public.memberships m
            where m.tenant_id = damage_lines.tenant_id and m.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.memberships m
            where m.tenant_id = damage_lines.tenant_id and m.user_id = auth.uid())
  );

create policy damage_photos_tenant_member on public.damage_photos
  using (
    exists (select 1 from public.memberships m
            where m.tenant_id = damage_photos.tenant_id and m.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.memberships m
            where m.tenant_id = damage_photos.tenant_id and m.user_id = auth.uid())
  );

create policy documents_tenant_member on public.documents
  using (
    exists (select 1 from public.memberships m
            where m.tenant_id = documents.tenant_id and m.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.memberships m
            where m.tenant_id = documents.tenant_id and m.user_id = auth.uid())
  );
