-- Snapshot of listing admin lists, written by `npm run listings:update`.

create table if not exists public.listing_admin_snapshot (
  id int primary key default 1 check (id = 1),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.listing_admin_snapshot is
  'Last local listings:update result for the admin 목록 관리 page';

alter table public.listing_admin_snapshot enable row level security;

grant select, insert, update, delete on public.listing_admin_snapshot to service_role;
