-- Run in Supabase SQL Editor (Dashboard → SQL)

create table if not exists public.stocks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ticker text not null,
  sector text,
  market text,
  created_at timestamptz not null default now(),
  constraint stocks_ticker_unique unique (ticker),
  constraint stocks_market_check check (
    market is null or market in ('us', 'kr')
  )
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
    sentiment is null
    or sentiment in ('positive', 'negative', 'neutral')
  )
);

create index if not exists disclosures_created_at_idx
  on public.disclosures (created_at desc);

create index if not exists disclosures_stock_id_idx
  on public.disclosures (stock_id);

alter table public.stocks enable row level security;
alter table public.disclosures enable row level security;

create policy "stocks_select_public"
  on public.stocks for select
  using (true);

create policy "disclosures_select_public"
  on public.disclosures for select
  using (true);

-- 기존 DB 마이그레이션 (이미 테이블이 있을 때)
-- alter table public.stocks add column if not exists market text;
-- alter table public.disclosures add column if not exists view_count int not null default 0;
-- alter table public.disclosures add column if not exists views_1h int not null default 0;
-- create index if not exists disclosures_view_count_idx on public.disclosures (view_count desc);
-- create index if not exists disclosures_views_1h_idx on public.disclosures (views_1h desc);
