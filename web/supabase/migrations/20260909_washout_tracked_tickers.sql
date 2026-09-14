create table if not exists public.washout_tracked_tickers (
  ticker text primary key,
  updated_at timestamptz not null default now()
);

comment on table public.washout_tracked_tickers is
  '설거지 지수에서 현재 추적 중인 종목. 서버 재시작·야간에도 목록을 유지한다.';

alter table public.washout_tracked_tickers enable row level security;
