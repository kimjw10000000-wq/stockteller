-- NYSE / NASDAQ 전체 상장사 마스터 (상장폐지 D-Day 검색용)
create extension if not exists pg_trgm;

create table if not exists public.us_listed_companies (
  ticker text primary key,
  name text not null,
  market_cap numeric,
  cik text not null,
  exchange text not null,
  updated_at timestamptz not null default now(),
  market_cap_updated_at timestamptz,
  primary_newswire text,
  newswire_updated_at timestamptz
);

create index if not exists us_listed_companies_exchange_idx
  on public.us_listed_companies (exchange);

create index if not exists us_listed_companies_updated_at_idx
  on public.us_listed_companies (updated_at desc);

create index if not exists us_listed_companies_market_cap_updated_at_idx
  on public.us_listed_companies (market_cap_updated_at nulls first);

create index if not exists us_listed_companies_name_trgm
  on public.us_listed_companies using gin (name gin_trgm_ops);

create index if not exists us_listed_companies_ticker_trgm
  on public.us_listed_companies using gin (ticker gin_trgm_ops);

comment on table public.us_listed_companies is
  'SEC company_tickers_exchange + market cap enrichment for compliance search';

alter table public.us_listed_companies enable row level security;

drop policy if exists "us_listed_companies_select_public" on public.us_listed_companies;
create policy "us_listed_companies_select_public"
  on public.us_listed_companies for select using (true);
