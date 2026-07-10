-- disclosures: 공시·뉴스 3단계 시그널 계기판
alter table public.disclosures
  add column if not exists signal_status text not null default 'positive';

alter table public.disclosures drop constraint if exists disclosures_signal_status_check;
alter table public.disclosures add constraint disclosures_signal_status_check check (
  signal_status in ('positive', 'caution', 'danger')
);

create index if not exists disclosures_signal_status_idx
  on public.disclosures (signal_status);
