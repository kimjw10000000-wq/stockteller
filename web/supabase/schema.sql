-- Run in Supabase SQL Editor (Dashboard → SQL)

create table if not exists public.stocks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ticker text not null,
  sector text,
  created_at timestamptz not null default now(),
  constraint stocks_ticker_unique unique (ticker)
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
