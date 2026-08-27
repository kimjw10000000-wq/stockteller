-- GlobeNewswire RSS → wire_news, keyed to issuer ticker (us_listed_companies)

create table if not exists public.wire_news (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  url text not null,
  title text not null,
  teaser text,
  summary text,
  sentiment text,
  analysis_score numeric,
  tickers text[] not null default '{}',
  primary_ticker text not null,
  company_name text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  market_cap numeric,
  cap_bucket text,
  language text,
  llm_model text,
  unique (source, external_id)
);

-- 예전에 primary_ticker 없이 들어간 행은 티커 매칭이 안 된 것 → 삭제 후 NOT NULL
delete from public.wire_news where primary_ticker is null or btrim(primary_ticker) = '';

alter table public.wire_news
  alter column primary_ticker set not null;

do $$
begin
  alter table public.wire_news
    add constraint wire_news_primary_ticker_fkey
    foreign key (primary_ticker)
    references public.us_listed_companies (ticker)
    on update cascade
    on delete restrict;
exception
  when duplicate_object then null;
end $$;

create index if not exists wire_news_published_at_idx
  on public.wire_news (published_at desc nulls last);

create index if not exists wire_news_primary_ticker_idx
  on public.wire_news (primary_ticker);

create index if not exists wire_news_ticker_published_idx
  on public.wire_news (primary_ticker, published_at desc nulls last);

comment on table public.wire_news is
  'GlobeNewswire RSS headline+teaser, stored against us_listed_companies.ticker';
comment on column public.wire_news.primary_ticker is
  'Issuer ticker in us_listed_companies — the company this news belongs to';

alter table public.wire_news enable row level security;

drop policy if exists "wire_news_select_public" on public.wire_news;
create policy "wire_news_select_public"
  on public.wire_news for select using (true);
