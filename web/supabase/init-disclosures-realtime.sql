-- =============================================================================
-- Stockteller: disclosures + stocks + Realtime (Supabase SQL Editor에 붙여넣기)
-- =============================================================================
-- 이미지 URL은 별도 컬럼이 아니라 gemini_metadata JSON 안에 저장됩니다:
--   { "source": "admin_publish", "cover_image": "https://...", "author_email": "..." }
-- =============================================================================

-- 1) 종목 테이블 (피드에서 stocks 조인에 사용)
create table if not exists public.stocks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ticker text not null,
  sector text,
  market text,
  created_at timestamptz not null default now(),
  constraint stocks_ticker_unique unique (ticker),
  constraint stocks_market_check check (
    market is null or market in ('us', 'kr')
  )
);

-- 2) 뉴스·공시 테이블 (관리자 발행 + 크롤러 + AI 분석 공통)
create table if not exists public.disclosures (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid references public.stocks (id) on delete set null,
  external_id text unique,
  title text,
  raw_content text not null,
  summary text,
  sentiment text,
  analysis_score numeric,
  gemini_metadata jsonb,
  view_count int not null default 0,
  views_1h int not null default 0,
  market_type text,
  stock_name text,
  stock_code text,
  created_at timestamptz not null default now(),
  constraint disclosures_sentiment_check check (
    sentiment is null
    or sentiment in ('positive', 'negative', 'neutral')
  ),
  constraint disclosures_market_type_check check (
    market_type is null or market_type in ('us', 'kr')
  )
);

-- 3) 인덱스 (피드 정렬·페이지네이션)
create index if not exists disclosures_created_at_idx
  on public.disclosures (created_at desc);

create index if not exists disclosures_stock_id_idx
  on public.disclosures (stock_id);

create index if not exists disclosures_view_count_idx
  on public.disclosures (view_count desc);

create index if not exists disclosures_views_1h_idx
  on public.disclosures (views_1h desc);

create index if not exists disclosures_market_type_idx
  on public.disclosures (market_type);

create index if not exists disclosures_market_type_created_at_idx
  on public.disclosures (market_type, created_at desc);

-- 4) RLS — 사이트 방문자는 읽기만 (쓰기는 서버 service_role 키로 처리)
alter table public.stocks enable row level security;
alter table public.disclosures enable row level security;

drop policy if exists "stocks_select_public" on public.stocks;
create policy "stocks_select_public"
  on public.stocks for select
  using (true);

drop policy if exists "disclosures_select_public" on public.disclosures;
create policy "disclosures_select_public"
  on public.disclosures for select
  using (true);

-- 5) Realtime — INSERT 시 /feed 자동 갱신
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'disclosures'
  ) then
    alter publication supabase_realtime add table public.disclosures;
  end if;
end $$;

-- 6) (선택) 관리자 이미지 업로드용 Storage 버킷
insert into storage.buckets (id, name, public)
values ('news-images', 'news-images', true)
on conflict (id) do update set public = true;

drop policy if exists "news_images_public_read" on storage.objects;
create policy "news_images_public_read"
  on storage.objects for select
  using (bucket_id = 'news-images');

-- 완료 확인
select 'disclosures' as table_name, count(*) as row_count from public.disclosures;
