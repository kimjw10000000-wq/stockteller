export type Sentiment = "positive" | "negative" | "neutral";

export type MarketType = "us" | "kr";

import type { SignalStatus } from "@/lib/signal-status";

export type { SignalStatus } from "@/lib/signal-status";

export type StockRow = {
  id: string;
  name: string;
  ticker: string;
  sector: string | null;
  market?: string | null;
  created_at: string;
};

export type DisclosureRow = {
  id: string;
  stock_id: string | null;
  external_id: string | null;
  title: string | null;
  raw_content: string;
  summary: string | null;
  sentiment: Sentiment | null;
  analysis_score: number | null;
  gemini_metadata: Record<string, unknown> | null;
  view_count?: number | null;
  views_1h?: number | null;
  market_type?: MarketType | null;
  stock_name?: string | null;
  stock_code?: string | null;
  membership_type?: "free" | "premium" | null;
  signal_status?: SignalStatus | null;
  created_at: string;
};

export type DisclosureWithStock = DisclosureRow & {
  stocks: Pick<StockRow, "name" | "ticker" | "sector" | "market"> | null;
};

/** LLM 요약 결과. 6-K 파이프라인은 사실 요약만 쓰고 sentiment/score는 항상 중립·0. */
export type GeminiAnalysisResult = {
  title: string;
  summary_lines: string[];
  sentiment: Sentiment;
  /** 호재(+)/악재(-) 점수. -100 ~ +100. 6-K 요약에서는 사용하지 않음. */
  score: number;
};
