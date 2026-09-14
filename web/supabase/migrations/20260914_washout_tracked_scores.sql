alter table if exists public.washout_tracked_tickers
  add column if not exists score double precision,
  add column if not exists dd_pct double precision,
  add column if not exists session_elapsed_min double precision,
  add column if not exists session_quota_min double precision;
