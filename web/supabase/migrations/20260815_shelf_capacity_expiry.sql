-- WKSI unlimited shelf flag + 3-year expiry (effect_date + interval '3 years')

alter table public.us_listed_companies
  add column if not exists is_unlimited_shelf boolean not null default false;

alter table public.us_listed_companies
  alter column total_registered_offering_capacity drop not null;

comment on column public.us_listed_companies.is_unlimited_shelf is
  'True when an active S-3ASR (DOMESTIC) or F-3ASR (FOREIGN) exists within 3 years of effect/filing date';

comment on column public.us_listed_companies.total_registered_offering_capacity is
  'Sum of 3-year-active sized shelves (S-1/S-3 or F-1/F-3). NULL when is_unlimited_shelf';

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
