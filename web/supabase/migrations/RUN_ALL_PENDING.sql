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
  add column if not exists membership_type text not null default 'free',
  add column if not exists signal_status text not null default 'positive';

alter table public.disclosures drop constraint if exists disclosures_market_type_check;
alter table public.disclosures add constraint disclosures_market_type_check check (
  market_type is null or market_type in ('us', 'kr')
);

alter table public.disclosures drop constraint if exists disclosures_signal_status_check;
alter table public.disclosures add constraint disclosures_signal_status_check check (
  signal_status in ('positive', 'neutral', 'caution', 'danger')
);

create index if not exists disclosures_created_at_idx on public.disclosures (created_at desc);
create index if not exists disclosures_market_type_idx on public.disclosures (market_type);
create index if not exists disclosures_signal_status_idx on public.disclosures (signal_status);

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

-- us_listed_companies (NYSE/NASDAQ master for compliance search)
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

alter table public.us_listed_companies
  add column if not exists issuer_type text;

alter table public.us_listed_companies
  drop constraint if exists us_listed_companies_issuer_type_check;

alter table public.us_listed_companies
  add constraint us_listed_companies_issuer_type_check
  check (issuer_type is null or issuer_type in ('DOMESTIC', 'FOREIGN'));

alter table public.us_listed_companies
  add column if not exists total_registered_offering_capacity numeric not null default 0;

alter table public.us_listed_companies
  add column if not exists registered_capacity_updated_at timestamptz;

create table if not exists public.registered_filings (
  id uuid primary key default gen_random_uuid(),
  ticker text not null references public.us_listed_companies (ticker) on delete cascade,
  cik text not null,
  file_number text not null,
  form_type text not null,
  effect_date date not null,
  max_offering_amount numeric,
  is_active boolean not null default true,
  accession_number text,
  filing_url text,
  parse_method text,
  updated_at timestamptz not null default now(),
  constraint registered_filings_cik_file_number_key unique (cik, file_number)
);

alter table public.registered_filings enable row level security;
drop policy if exists "registered_filings_select_public" on public.registered_filings;
create policy "registered_filings_select_public"
  on public.registered_filings for select using (true);

-- WKSI unlimited shelf + 3-year expiry
alter table public.us_listed_companies
  add column if not exists is_unlimited_shelf boolean not null default false;

alter table public.us_listed_companies
  alter column total_registered_offering_capacity drop not null;

create index if not exists registered_filings_effect_date_idx
  on public.registered_filings (effect_date);

create or replace view public.v_active_registered_filings as
select
  rf.*,
  (current_date <= rf.effect_date + interval '3 years') as live_active
from public.registered_filings rf;

create or replace view public.v_company_shelf_capacity as
select
  c.ticker,
  c.cik,
  c.issuer_type,
  exists (
    select 1
    from public.registered_filings rf
    where rf.cik = c.cik
      and current_date <= rf.effect_date + interval '3 years'
      and (
        rf.form_type in ('S-3ASR', 'F-3ASR')
        or rf.parse_method = 'wksi_asr'
      )
  ) as is_unlimited_shelf,
  case
    when exists (
      select 1
      from public.registered_filings rf
      where rf.cik = c.cik
        and current_date <= rf.effect_date + interval '3 years'
        and (
          rf.form_type in ('S-3ASR', 'F-3ASR')
          or rf.parse_method = 'wksi_asr'
        )
    ) then null
    else coalesce((
      select sum(rf.max_offering_amount)
      from public.registered_filings rf
      where rf.cik = c.cik
        and current_date <= rf.effect_date + interval '3 years'
        and rf.max_offering_amount is not null
        and rf.form_type not in ('S-3ASR', 'F-3ASR')
        and coalesce(rf.parse_method, '') <> 'wksi_asr'
    ), 0)
  end as live_capacity
from public.us_listed_companies c;

alter view public.v_active_registered_filings set (security_invoker = true);
alter view public.v_company_shelf_capacity set (security_invoker = true);

grant select on public.v_active_registered_filings to anon, authenticated;
grant select on public.v_company_shelf_capacity to anon, authenticated;

create or replace function public.refresh_registered_capacity_totals()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  filings_n int;
  companies_n int;
begin
  update public.registered_filings
  set
    is_active = (current_date <= effect_date + interval '3 years'),
    updated_at = now()
  where is_active is distinct from (current_date <= effect_date + interval '3 years');
  get diagnostics filings_n = row_count;

  update public.us_listed_companies c
  set
    is_unlimited_shelf = v.is_unlimited_shelf,
    total_registered_offering_capacity = v.live_capacity,
    registered_capacity_updated_at = now()
  from public.v_company_shelf_capacity v
  where c.ticker = v.ticker;
  get diagnostics companies_n = row_count;

  return json_build_object(
    'filingsUpdated', filings_n,
    'companiesUpdated', companies_n
  );
end;
$$;

revoke all on function public.refresh_registered_capacity_totals() from public, anon, authenticated;
grant execute on function public.refresh_registered_capacity_totals() to service_role;

-- Rule 415(a)(6) rollover columns (same as 20260816_shelf_capacity_rollover.sql)
alter table public.registered_filings
  add column if not exists status text not null default 'ACTIVE';
alter table public.registered_filings
  drop constraint if exists registered_filings_status_check;
alter table public.registered_filings
  add constraint registered_filings_status_check
  check (status in ('ACTIVE', 'REPLACED', 'EXPIRED'));
alter table public.registered_filings
  add column if not exists prior_file_number text;
alter table public.registered_filings
  add column if not exists replaced_by_file_number text;

create or replace view public.v_active_registered_filings as
select
  rf.*,
  (
    coalesce(rf.status, 'ACTIVE') = 'ACTIVE'
    and current_date <= rf.effect_date + interval '3 years'
  ) as live_active
from public.registered_filings rf;

create or replace view public.v_company_shelf_capacity as
select
  c.ticker,
  c.cik,
  c.issuer_type,
  exists (
    select 1
    from public.registered_filings rf
    where rf.cik = c.cik
      and coalesce(rf.status, 'ACTIVE') = 'ACTIVE'
      and current_date <= rf.effect_date + interval '3 years'
      and (
        rf.form_type in ('S-3ASR', 'F-3ASR')
        or rf.parse_method = 'wksi_asr'
      )
  ) as is_unlimited_shelf,
  case
    when exists (
      select 1
      from public.registered_filings rf
      where rf.cik = c.cik
        and coalesce(rf.status, 'ACTIVE') = 'ACTIVE'
        and current_date <= rf.effect_date + interval '3 years'
        and (
          rf.form_type in ('S-3ASR', 'F-3ASR')
          or rf.parse_method = 'wksi_asr'
        )
    ) then null
    else coalesce((
      select sum(rf.max_offering_amount)
      from public.registered_filings rf
      where rf.cik = c.cik
        and coalesce(rf.status, 'ACTIVE') = 'ACTIVE'
        and rf.is_active = true
        and current_date <= rf.effect_date + interval '3 years'
        and rf.max_offering_amount is not null
        and rf.form_type not in ('S-3ASR', 'F-3ASR')
        and coalesce(rf.parse_method, '') <> 'wksi_asr'
    ), 0)
  end as live_capacity
from public.us_listed_companies c;

alter view public.v_active_registered_filings set (security_invoker = true);
alter view public.v_company_shelf_capacity set (security_invoker = true);

create or replace function public.refresh_registered_capacity_totals()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  filings_n int;
  companies_n int;
begin
  update public.registered_filings
  set
    is_active = (
      coalesce(status, 'ACTIVE') = 'ACTIVE'
      and current_date <= effect_date + interval '3 years'
    ),
    status = case
      when coalesce(status, 'ACTIVE') = 'REPLACED' then 'REPLACED'
      when current_date <= effect_date + interval '3 years' then 'ACTIVE'
      else 'EXPIRED'
    end,
    updated_at = now()
  where
    is_active is distinct from (
      coalesce(status, 'ACTIVE') = 'ACTIVE'
      and current_date <= effect_date + interval '3 years'
    )
    or status is distinct from (
      case
        when coalesce(status, 'ACTIVE') = 'REPLACED' then 'REPLACED'
        when current_date <= effect_date + interval '3 years' then 'ACTIVE'
        else 'EXPIRED'
      end
    );
  get diagnostics filings_n = row_count;

  update public.us_listed_companies c
  set
    is_unlimited_shelf = v.is_unlimited_shelf,
    total_registered_offering_capacity = v.live_capacity,
    registered_capacity_updated_at = now()
  from public.v_company_shelf_capacity v
  where c.ticker = v.ticker
    and c.cik = v.cik;
  get diagnostics companies_n = row_count;

  return json_build_object(
    'filingsUpdated', filings_n,
    'companiesUpdated', companies_n
  );
end;
$$;

revoke all on function public.refresh_registered_capacity_totals() from public, anon, authenticated;
grant execute on function public.refresh_registered_capacity_totals() to service_role;
