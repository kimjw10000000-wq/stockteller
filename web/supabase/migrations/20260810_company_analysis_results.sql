-- Cached EDGAR compliance / offering analysis (search reads this, not live EDGAR)
create table if not exists public.company_analysis_results (
  ticker text primary key,
  company_name text,
  rule_5550a_status jsonb not null default '{}'::jsonb,
  has_offering_risk boolean not null default false,
  offering_form_type text,
  offering_filing_date timestamptz,
  offering_filing_url text,
  delisting_dday_type text,
  delisting_dday_value integer,
  bid_price_hits jsonb not null default '[]'::jsonb,
  last_analyzed_at timestamptz not null default now(),
  analysis_error text
);

create index if not exists company_analysis_results_last_analyzed_at_idx
  on public.company_analysis_results (last_analyzed_at asc nulls first);

create index if not exists company_analysis_results_has_offering_risk_idx
  on public.company_analysis_results (has_offering_risk)
  where has_offering_risk = true;

comment on table public.company_analysis_results is
  'Precomputed SEC EDGAR analysis for compliance D-Day / offering UI (cache)';

alter table public.company_analysis_results enable row level security;

drop policy if exists "company_analysis_results_select_public" on public.company_analysis_results;
create policy "company_analysis_results_select_public"
  on public.company_analysis_results for select using (true);
