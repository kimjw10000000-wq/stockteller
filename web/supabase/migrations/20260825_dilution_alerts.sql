-- 지분희석(오퍼링) 경보 슬롯 + 결제 티어
-- Supabase SQL Editor에서 실행하세요.

alter table public.profiles
  add column if not exists plan text not null default 'free';

alter table public.profiles
  drop constraint if exists profiles_plan_check;

alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('free', 'pro'));

comment on column public.profiles.plan is
  'Billing tier. free = 알람 1슬롯·ET 04:00 기준 1일 1회. pro = 무제한. Paddle 웹훅만 변경.';

-- 로그인 사용자가 자기 plan을 올리지 못하게 함 (SQL Editor·service_role은 가능)
create or replace function public.freeze_profiles_plan()
returns trigger
language plpgsql
as $$
begin
  if new.plan is distinct from old.plan
     and auth.uid() is not null
     and auth.role() = 'authenticated' then
    new.plan := old.plan;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_freeze_plan on public.profiles;
create trigger profiles_freeze_plan
  before update on public.profiles
  for each row execute function public.freeze_profiles_plan();

create table if not exists public.dilution_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ticker text,
  company_name text,
  enabled boolean not null default false,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dilution_alerts_user_id_idx
  on public.dilution_alerts (user_id, created_at);

create unique index if not exists dilution_alerts_user_ticker_uidx
  on public.dilution_alerts (user_id, ticker)
  where ticker is not null;

comment on table public.dilution_alerts is
  'User dilution/offering alert slots. Free tier is capped at 1 row in application + insert trigger.';

create or replace function public.dilution_alerts_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists dilution_alerts_updated_at on public.dilution_alerts;
create trigger dilution_alerts_updated_at
  before update on public.dilution_alerts
  for each row execute function public.dilution_alerts_set_updated_at();

create or replace function public.enforce_dilution_alert_slot_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_plan text;
  slot_count int;
begin
  select coalesce(plan, 'free') into user_plan
  from public.profiles
  where id = new.user_id;

  if user_plan = 'pro' then
    return new;
  end if;

  select count(*) into slot_count
  from public.dilution_alerts
  where user_id = new.user_id;

  if slot_count >= 1 then
    raise exception 'free plan allows only 1 alert slot'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists dilution_alerts_slot_limit on public.dilution_alerts;
create trigger dilution_alerts_slot_limit
  before insert on public.dilution_alerts
  for each row execute function public.enforce_dilution_alert_slot_limit();

create or replace function public.prevent_free_dilution_alert_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_plan text;
begin
  select coalesce(plan, 'free') into user_plan
  from public.profiles
  where id = old.user_id;

  if coalesce(user_plan, 'free') <> 'pro' then
    raise exception 'free plan cannot delete alert slots'
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

drop trigger if exists dilution_alerts_prevent_free_delete on public.dilution_alerts;
create trigger dilution_alerts_prevent_free_delete
  before delete on public.dilution_alerts
  for each row execute function public.prevent_free_dilution_alert_delete();

alter table public.dilution_alerts enable row level security;

drop policy if exists "dilution_alerts_select_own" on public.dilution_alerts;
create policy "dilution_alerts_select_own"
  on public.dilution_alerts for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "dilution_alerts_insert_own" on public.dilution_alerts;
create policy "dilution_alerts_insert_own"
  on public.dilution_alerts for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "dilution_alerts_update_own" on public.dilution_alerts;
create policy "dilution_alerts_update_own"
  on public.dilution_alerts for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "dilution_alerts_delete_own" on public.dilution_alerts;
create policy "dilution_alerts_delete_own"
  on public.dilution_alerts for delete
  to authenticated
  using (auth.uid() = user_id);
