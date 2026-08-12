import {
  BLS_URLS,
  compareActualForecast,
  INDICATOR_LABELS,
  type IndicatorCardState,
  type IndicatorId,
  type IndicatorReleasePayload,
  type IndicatorsSnapshot,
} from "./types";

type ForecastStore = {
  CPI: number | null;
  PPI: number | null;
  cpiNextReleaseAt: string | null;
  ppiNextReleaseAt: string | null;
};

function numEnv(name: string): number | null {
  const v = process.env[name]?.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strEnv(name: string): string | null {
  const v = process.env[name]?.trim();
  return v || null;
}

const runtimeForecast: ForecastStore = {
  CPI: null,
  PPI: null,
  cpiNextReleaseAt: null,
  ppiNextReleaseAt: null,
};

const runtimeActual: Partial<
  Record<
    IndicatorId,
    {
      actual: number;
      period: "mom" | "yoy" | "unknown";
      releasedAt: string;
      message?: string;
    }
  >
> = {};

let scrapingFlags: Record<IndicatorId, boolean> = { CPI: false, PPI: false };

export function getForecast(id: IndicatorId): number | null {
  if (runtimeForecast[id] != null) return runtimeForecast[id];
  return id === "CPI" ? numEnv("INDICATOR_CPI_FORECAST") : numEnv("INDICATOR_PPI_FORECAST");
}

export function getNextReleaseAt(id: IndicatorId): string | null {
  if (id === "CPI") {
    return runtimeForecast.cpiNextReleaseAt ?? strEnv("INDICATOR_CPI_NEXT_RELEASE");
  }
  return runtimeForecast.ppiNextReleaseAt ?? strEnv("INDICATOR_PPI_NEXT_RELEASE");
}

export function setForecasts(input: {
  cpi?: number | null;
  ppi?: number | null;
  cpiNextReleaseAt?: string | null;
  ppiNextReleaseAt?: string | null;
}) {
  if (input.cpi !== undefined) runtimeForecast.CPI = input.cpi;
  if (input.ppi !== undefined) runtimeForecast.PPI = input.ppi;
  if (input.cpiNextReleaseAt !== undefined) {
    runtimeForecast.cpiNextReleaseAt = input.cpiNextReleaseAt;
  }
  if (input.ppiNextReleaseAt !== undefined) {
    runtimeForecast.ppiNextReleaseAt = input.ppiNextReleaseAt;
  }
}

export function setActual(
  id: IndicatorId,
  actual: number,
  meta?: { period?: "mom" | "yoy" | "unknown"; message?: string; releasedAt?: string }
) {
  runtimeActual[id] = {
    actual,
    period: meta?.period ?? "unknown",
    releasedAt: meta?.releasedAt ?? new Date().toISOString(),
    message: meta?.message,
  };
}

export function setScraping(id: IndicatorId, on: boolean) {
  scrapingFlags = { ...scrapingFlags, [id]: on };
}

export function isScraping(id: IndicatorId): boolean {
  return Boolean(scrapingFlags[id]);
}

export function buildPayload(id: IndicatorId): IndicatorReleasePayload {
  const forecast = getForecast(id);
  const act = runtimeActual[id];
  const actual = act?.actual ?? null;
  return {
    indicator: id,
    actual,
    forecast,
    period: act?.period ?? "unknown",
    status: compareActualForecast(actual, forecast),
    releasedAt: act?.releasedAt ?? null,
    sourceUrl: BLS_URLS[id],
    message: act?.message ?? null,
  };
}

export function buildCard(id: IndicatorId): IndicatorCardState {
  return {
    ...buildPayload(id),
    label: INDICATOR_LABELS[id],
    nextReleaseAt: getNextReleaseAt(id),
    scraping: isScraping(id),
  };
}

export function getSnapshot(): IndicatorsSnapshot {
  return {
    fetchedAt: new Date().toISOString(),
    items: [buildCard("CPI"), buildCard("PPI")],
  };
}
