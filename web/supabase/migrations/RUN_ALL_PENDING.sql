-- Supabase SQL Editor에 붙여넣고 Run (한 번만 실행)
-- disclosures + stocks + market/stock 컬럼 + Realtime

create table if not exists public.stocks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ticker text not null,
  sector text,
  market text,
  created_at timestamptz not null default now(),
  constraint stocks_ticker_unique unique (ticker),
  constraint stocks_market_check check (market is null or market in ('us', 'kr'))
);

create table if not exists public.disclosures (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid references public.stocks (id) on delete set null,
  external_id text unique,
  title text,
  raw_content text not null,
  summary text,
  sentiment text,
  analysis_score numeric,
  gemini_metadata jsonb,
  view_count int not null default 0,
  views_1h int not null default 0,
  created_at timestamptz not null default now(),
  constraint disclosures_sentiment_check check (
    sentiment is null or sentiment in ('positive', 'negative', 'neutral')
  )
);

alter table public.disclosures
  add column if not exists market_type text,
  add column if not exists stock_name text,
  add column if not exists stock_code text,
  add column if not exists membership_type text not null default 'free';

alter table public.disclosures drop constraint if exists disclosures_market_type_check;
alter table public.disclosures add constraint disclosures_market_type_check check (
  market_type is null or market_type in ('us', 'kr')
);

create index if not exists disclosures_created_at_idx on public.disclosures (created_at desc);
create index if not exists disclosures_market_type_idx on public.disclosures (market_type);

alter table public.stocks enable row level security;
alter table public.disclosures enable row level security;

drop policy if exists "stocks_select_public" on public.stocks;
create policy "stocks_select_public" on public.stocks for select using (true);

drop policy if exists "disclosures_select_public" on public.disclosures;
create policy "disclosures_select_public" on public.disclosures for select using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'disclosures'
  ) then
    alter publication supabase_realtime add table public.disclosures;
  end if;
end $$;
