-- Registered offering capacity (EFFECT / S-3 / F-3 / S-1 / F-1)

alter table public.us_listed_companies
  add column if not exists total_registered_offering_capacity numeric not null default 0;

alter table public.us_listed_companies
  add column if not exists registered_capacity_updated_at timestamptz;

comment on column public.us_listed_companies.total_registered_offering_capacity is
  'Sum of active (effect date within 3 years) sized shelves; NULL when WKSI unlimited';

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

create index if not exists registered_filings_ticker_idx
  on public.registered_filings (ticker);

create index if not exists registered_filings_cik_idx
  on public.registered_filings (cik);

create index if not exists registered_filings_active_idx
  on public.registered_filings (is_active)
  where is_active = true;

comment on table public.registered_filings is
  'SEC EFFECT-backed sized registrations and WKSI ASR rows; amounts expire 3 years after effect_date';

alter table public.registered_filings enable row level security;

drop policy if exists "registered_filings_select_public" on public.registered_filings;
create policy "registered_filings_select_public"
  on public.registered_filings for select using (true);
