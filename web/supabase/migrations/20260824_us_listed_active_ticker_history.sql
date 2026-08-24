-- Daily SEC listing sync: hide delisted names from search, keep rows, track ticker changes.

alter table public.us_listed_companies
  add column if not exists is_active boolean not null default true;

alter table public.us_listed_companies
  add column if not exists previous_tickers jsonb not null default '[]'::jsonb;

create index if not exists us_listed_companies_cik_idx
  on public.us_listed_companies (cik);

create index if not exists us_listed_companies_is_active_idx
  on public.us_listed_companies (is_active)
  where is_active = true;

comment on column public.us_listed_companies.is_active is
  'False = gone from SEC NASDAQ/NYSE/AMEX list; keep row, hide from search';
comment on column public.us_listed_companies.previous_tickers is
  'Prior symbols for this CIK row after a ticker change';

alter table public.registered_filings
  drop constraint if exists registered_filings_ticker_fkey;

alter table public.registered_filings
  add constraint registered_filings_ticker_fkey
  foreign key (ticker) references public.us_listed_companies (ticker)
  on delete cascade on update cascade;
