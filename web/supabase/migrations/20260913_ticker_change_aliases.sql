-- Temporary old→new ticker map until Polygon drops the old symbol.

create table if not exists public.ticker_change_aliases (
  old_ticker text primary key,
  new_ticker text not null,
  created_at timestamptz not null default now()
);

create index if not exists ticker_change_aliases_new_ticker_idx
  on public.ticker_change_aliases (new_ticker);

comment on table public.ticker_change_aliases is
  'Washout display aliases: snapshot may still print the pre-change ticker';

alter table public.ticker_change_aliases enable row level security;

drop policy if exists "ticker_change_aliases_select_public" on public.ticker_change_aliases;
create policy "ticker_change_aliases_select_public"
  on public.ticker_change_aliases for select using (true);
