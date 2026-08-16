-- Bid-price notice/deadline cache + exchange labels (NASDAQ / AMEX / NYSE)

alter table public.company_analysis_results
  add column if not exists bid_price_event_date date,
  add column if not exists bid_price_event_kind text;

comment on column public.company_analysis_results.bid_price_event_date is
  'Canonical $1 bid-price date: deadline if parsed, else notice date';
comment on column public.company_analysis_results.bid_price_event_kind is
  'deadline | notice — which date was stored in bid_price_event_date';

create index if not exists company_analysis_results_bid_price_event_date_idx
  on public.company_analysis_results (bid_price_event_date)
  where bid_price_event_date is not null;

-- Normalize existing exchange spellings
update public.us_listed_companies
set exchange = 'NASDAQ'
where exchange ~* '^nasdaq';

update public.us_listed_companies
set exchange = 'AMEX'
where exchange ~* '^(amex|nyse[[:space:]]*american|nyse[[:space:]]*mkt)';

update public.us_listed_companies
set exchange = 'NYSE'
where exchange ~* '^nyse' and exchange !~* 'american|amex|mkt';
