-- ============================================================
-- disclosures 테이블 (Supabase → SQL Editor에 붙여넣기)
-- ============================================================
-- ⚠ 이미 public.disclosures 가 다른 컬럼 구조로 존재하면
--    먼저 백업 후 아래 한 줄의 주석을 해제해 삭제한 뒤 실행하세요.
--    DROP TABLE IF EXISTS public.disclosures CASCADE;

CREATE TABLE public.disclosures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_name text NOT NULL,
  ticker text NOT NULL,
  original_text text NOT NULL,
  ai_summary text,
  sentiment_score integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT disclosures_sentiment_score_range CHECK (
    sentiment_score >= -10
    AND sentiment_score <= 10
  )
);

COMMENT ON TABLE public.disclosures IS '공시 원문 및 AI 요약·호악재 점수';
COMMENT ON COLUMN public.disclosures.sentiment_score IS '호재/악재 점수 -10(악재) ~ +10(호재)';

CREATE INDEX disclosures_created_at_idx ON public.disclosures (created_at DESC);
CREATE INDEX disclosures_ticker_idx ON public.disclosures (ticker);

ALTER TABLE public.disclosures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "disclosures_select_anon" ON public.disclosures;

-- 프론트(anon 키)에서 목록/상세 조회용 (필요 없으면 이 블록 삭제)
CREATE POLICY "disclosures_select_anon"
  ON public.disclosures
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 서비스 롤 키는 RLS를 우회하므로 API·크롤러에서 INSERT/UPDATE 가능
