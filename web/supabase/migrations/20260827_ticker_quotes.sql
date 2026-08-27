-- VPS Toss poller writes last price / day change; News/SEC cards read via anon.

create table if not exists public.ticker_quotes (
  ticker text primary key,
  last_price numeric,
  change_pct numeric,
  currency text,
  fetched_at timestamptz not null default now()
);

create index if not exists ticker_quotes_fetched_at_idx
  on public.ticker_quotes (fetched_at desc);

comment on table public.ticker_quotes is
  'Latest Toss quotes for News/SEC tickers, written by the VPS poller';
comment on column public.ticker_quotes.change_pct is
  'Day change in percent (1.23 means +1.23%)';

alter table public.ticker_quotes enable row level security;

drop policy if exists "ticker_quotes_select_public" on public.ticker_quotes;
create policy "ticker_quotes_select_public"
  on public.ticker_quotes for select using (true);
