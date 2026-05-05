-- 글로벌 급등 감지 엔진용 (Supabase SQL Editor에 실행)
-- Realtime: 대시보드 → Database → Replication → high_volatility_stocks 활성화

CREATE TABLE IF NOT EXISTS public.high_volatility_stocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market text NOT NULL CHECK (market IN ('US', 'KR', 'JP')),
  ticker text NOT NULL,
  name text,
  currency text NOT NULL DEFAULT 'USD',
  last_price numeric,
  prev_close numeric,
  change_pct numeric,
  volume bigint NOT NULL DEFAULT 0,
  source text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb,
  CONSTRAINT high_volatility_stocks_market_ticker UNIQUE (market, ticker)
);

CREATE INDEX IF NOT EXISTS high_volatility_stocks_updated_at_idx
  ON public.high_volatility_stocks (updated_at DESC);

ALTER TABLE public.high_volatility_stocks REPLICA IDENTITY FULL;

ALTER TABLE public.high_volatility_stocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "high_volatility_stocks_select_public"
  ON public.high_volatility_stocks FOR SELECT
  TO anon, authenticated
  USING (true);

-- 엔진(service role)은 RLS 우회로 upsert

-- Realtime: 아래 한 줄을 SQL Editor에서 실행 (이미 등록되어 있으면 에러 나면 무시)
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.high_volatility_stocks;

COMMENT ON TABLE public.high_volatility_stocks IS '실시간 급등·고변동 감지 종목 (Finnhub/KIS/J-Quants)';
