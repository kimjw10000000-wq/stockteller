-- Rule 415(a)(6) rollover + CIK-isolated live capacity
-- REPLACED rows must never be revived by the 3-year expiry job.

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

comment on column public.registered_filings.status is
  'ACTIVE = counts toward shelf; REPLACED = retired by successor file number (415(a)(6)); EXPIRED = past effect_date + 3 years';

comment on column public.registered_filings.prior_file_number is
  'Prior Registration No. parsed from Exhibit 107 / Rule 415(a)(6) carry-forward';

create index if not exists registered_filings_cik_status_idx
  on public.registered_filings (cik, status);

create or replace view public.v_active_registered_filings as
select
  rf.*,
  (
    coalesce(rf.status, 'ACTIVE') = 'ACTIVE'
    and current_date <= rf.effect_date + interval '3 years'
  ) as live_active
from public.registered_filings rf;

-- Totals are always scoped by CIK (never file_number alone, never cross-issuer).
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
  -- Do not revive REPLACED rollovers.
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
