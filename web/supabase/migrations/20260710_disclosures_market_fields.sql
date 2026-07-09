-- disclosures: 관리자 발행 시장·종목 정보
alter table public.disclosures
  add column if not exists market_type text,
  add column if not exists stock_name text,
  add column if not exists stock_code text;

alter table public.disclosures
  drop constraint if exists disclosures_market_type_check;

alter table public.disclosures
  add constraint disclosures_market_type_check check (
    market_type is null or market_type in ('us', 'kr')
  );

create index if not exists disclosures_market_type_idx
  on public.disclosures (market_type);

create index if not exists disclosures_market_type_created_at_idx
  on public.disclosures (market_type, created_at desc);
