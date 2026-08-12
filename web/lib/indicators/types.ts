export type IndicatorId = "CPI" | "PPI";

export type IndicatorCompareStatus = "HIGHER" | "LOWER" | "EQUAL" | "PENDING";

export type IndicatorReleasePayload = {
  indicator: IndicatorId;
  actual: number | null;
  forecast: number | null;
  /** MoM or YoY label when known */
  period?: "mom" | "yoy" | "unknown";
  status: IndicatorCompareStatus;
  releasedAt: string | null;
  sourceUrl: string;
  message?: string | null;
};

export type IndicatorCardState = IndicatorReleasePayload & {
  label: string;
  nextReleaseAt: string | null;
  scraping: boolean;
};

export type IndicatorsSnapshot = {
  fetchedAt: string;
  items: IndicatorCardState[];
};

export function compareActualForecast(
  actual: number | null,
  forecast: number | null
): IndicatorCompareStatus {
  if (actual == null || forecast == null) return "PENDING";
  if (actual > forecast) return "HIGHER";
  if (actual < forecast) return "LOWER";
  return "EQUAL";
}

export const BLS_URLS: Record<IndicatorId, string> = {
  CPI: "https://www.bls.gov/news.release/cpi.nr0.htm",
  PPI: "https://www.bls.gov/news.release/ppi.nr0.htm",
};

export const INDICATOR_LABELS: Record<IndicatorId, string> = {
  CPI: "CPI (소비자물가지수)",
  PPI: "PPI (생산자물가지수)",
};
