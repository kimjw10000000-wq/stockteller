create table if not exists public.washout_tape_highs (
  tape_date date not null,
  ticker text not null,
  high double precision not null,
  updated_at timestamptz not null default now(),
  primary key (tape_date, ticker)
);

comment on table public.washout_tape_highs is
  '테이프(전일 AH+당일 프리/본장)에서 본 종목 고가. 현재가가 30% 밑이어도 한 번 +30%면 추적한다.';

alter table public.washout_tape_highs enable row level security;
