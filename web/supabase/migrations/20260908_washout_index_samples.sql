create table if not exists public.washout_index_samples (
  t timestamptz not null primary key,
  v double precision not null,
  tape_date date not null
);

create index if not exists washout_index_samples_tape_t
  on public.washout_index_samples (tape_date, t);

comment on table public.washout_index_samples is
  '설거지 지수 분 단위 샘플. 1일=전날 애프터+당일 프리+본장.';

alter table public.washout_index_samples enable row level security;
