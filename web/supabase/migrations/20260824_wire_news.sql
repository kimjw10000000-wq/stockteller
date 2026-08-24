-- GlobeNewswire RSS headlines + Groq GPT Korean summaries (teaser only, no full-body scrape)

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
  primary_ticker text,
  company_name text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  market_cap numeric,
  cap_bucket text,
  language text,
  llm_model text,
  unique (source, external_id)
);

create index if not exists wire_news_published_at_idx
  on public.wire_news (published_at desc nulls last);

create index if not exists wire_news_primary_ticker_idx
  on public.wire_news (primary_ticker);

comment on table public.wire_news is
  'Public-wire RSS items summarized by Groq gpt-oss-20b for listed nano/micro caps';

alter table public.wire_news enable row level security;

drop policy if exists "wire_news_select_public" on public.wire_news;
create policy "wire_news_select_public"
  on public.wire_news for select using (true);
