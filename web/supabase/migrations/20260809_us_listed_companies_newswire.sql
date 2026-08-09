-- Ensure master table exists, then add newswire columns
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

alter table public.us_listed_companies
  add column if not exists primary_newswire text;

alter table public.us_listed_companies
  add column if not exists newswire_updated_at timestamptz;

create index if not exists us_listed_companies_newswire_updated_at_idx
  on public.us_listed_companies (newswire_updated_at nulls first);

comment on column public.us_listed_companies.primary_newswire is
  'Dominant press newswire from recent 8-K/6-K Exhibit 99.1 (batch-parsed)';
