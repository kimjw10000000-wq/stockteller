import { polygonGetWithKey } from "./polygon-keys";
import { peakResetIndices, washoutScoreSeries, type WashoutBar, type WashoutPoint } from "./washout-score";

export function polygonTimeMs(t: number | undefined): number | null {
  if (t == null || !Number.isFinite(t)) return null;
  if (t > 1e15) return Math.floor(t / 1e6);
  if (t > 1e12) return Math.floor(t);
  return Math.floor(t * 1000);
}

export type GroupedDayBar = {
  ticker: string;
  high: number;
  close: number;
};

const peakSecondCache = new Map<string, { peakAt: number; closeAt: number }>();

function peakCacheKey(ticker: string, minuteMs: number): string {
  return `${ticker}:${minuteMs}`;
}

export async function fetchGroupedDailyAdvanced(date: string, key: string): Promise<GroupedDayBar[]> {
  const payload = (await polygonGetWithKey(
    `/v2/aggs/grouped/locale/us/market/stocks/${date}?adjusted=true&include_otc=false`,
    key
  )) as { results?: Array<{ T?: string; h?: number; c?: number }> };
  const out: GroupedDayBar[] = [];
  for (const row of payload.results ?? []) {
    const ticker = (row.T ?? "").trim().toUpperCase();
    if (!ticker || row.h == null || row.c == null || !Number.isFinite(row.h) || !Number.isFinite(row.c)) {
      continue;
    }
    out.push({ ticker, high: row.h, close: row.c });
  }
  return out;
}

export async function fetchMinuteAggs(
  ticker: string,
  from: string,
  to: string,
  key: string
): Promise<WashoutBar[]> {
  const payload = (await polygonGetWithKey(
    `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/minute/${from}/${to}?adjusted=true&sort=asc&limit=50000`,
    key
  )) as { results?: Array<{ t?: number; o?: number; h?: number; c?: number }> };
  const out: WashoutBar[] = [];
  for (const row of payload.results ?? []) {
    const t = polygonTimeMs(row.t) ?? (row.t != null && Number.isFinite(row.t) ? row.t : null);
    if (t == null || row.c == null || !Number.isFinite(row.c)) continue;
    out.push({
      t,
      price: row.c,
      open: row.o,
      high: row.h,
      peakAt: t,
      closeAt: t + 60_000,
    });
  }
  return out;
}

async function fetchPeakSecondTimes(
  ticker: string,
  minuteMs: number,
  key: string
): Promise<{ peakAt: number; closeAt: number } | null> {
  const cached = peakSecondCache.get(peakCacheKey(ticker, minuteMs));
  if (cached) return cached;
  try {
    const payload = (await polygonGetWithKey(
      `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/second/${minuteMs}/${minuteMs + 59_999}?adjusted=true&sort=asc&limit=50000`,
      key
    )) as { results?: Array<{ t?: number; h?: number; c?: number }> };
    let peakAt = minuteMs;
    let peakHigh = -Infinity;
    let closeAt = minuteMs + 60_000;
    for (const row of payload.results ?? []) {
      const t = polygonTimeMs(row.t) ?? (row.t != null && Number.isFinite(row.t) ? row.t : null);
      if (t == null) continue;
      const high = row.h ?? row.c;
      if (high == null || !Number.isFinite(high)) continue;
      if (high > peakHigh) {
        peakHigh = high;
        peakAt = t;
      } else if (high === peakHigh) {
        peakAt = t;
      }
      closeAt = t + 1000;
    }
    const rec = { peakAt, closeAt };
    peakSecondCache.set(peakCacheKey(ticker, minuteMs), rec);
    return rec;
  } catch {
    return null;
  }
}

/** 고점이 난 분봉만 초봉을 붙여 dt를 계산한다. 나머지 분은 분봉 그대로. */
export async function scoreWithPeakSeconds(
  bars: WashoutBar[],
  prevClose: number,
  ticker: string,
  key: string
): Promise<WashoutPoint[]> {
  if (bars.length === 0) return [];
  const first = washoutScoreSeries(bars, prevClose);
  const indices = peakResetIndices(first);
  const seen = new Set<number>();
  for (const i of indices) {
    const bar = bars[i];
    if (!bar || seen.has(bar.t)) continue;
    seen.add(bar.t);
    const rec = await fetchPeakSecondTimes(ticker, bar.t, key);
    if (!rec) continue;
    bar.peakAt = rec.peakAt;
    bar.closeAt = rec.closeAt;
  }
  return washoutScoreSeries(bars, prevClose);
}
