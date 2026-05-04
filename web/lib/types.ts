export type Sentiment = "positive" | "negative" | "neutral";

export type StockRow = {
  id: string;
  name: string;
  ticker: string;
  sector: string | null;
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
  created_at: string;
};

export type DisclosureWithStock = DisclosureRow & {
  stocks: Pick<StockRow, "name" | "ticker" | "sector"> | null;
};

/** Gemini 분석 결과. `summary_lines`는 순서대로 [공시 의도 → 재무 영향 → 최종 결론] 한 줄씩. */
export type GeminiAnalysisResult = {
  title: string;
  /** 길이 3: [0]=공시 의도, [1]=재무적 영향, [2]=최종 결론 */
  summary_lines: string[];
  sentiment: Sentiment;
  /** 호재(+)/악재(-) 점수. -100 ~ +100. */
  score: number;
};
