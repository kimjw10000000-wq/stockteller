import { requireTossConfigured, tossFetch, tossSafe } from "./client";
import {
  parseMarketCalendar,
  parseStockInfo,
  parseStockWarning,
  unwrapResult,
} from "./parse";
import type {
  TossMarketCalendar,
  TossMarketCountry,
  TossStockInfo,
  TossStockWarning,
} from "./types";

/** GET /api/v1/stocks — max 200 */
export async function fetchTossStocks(symbols: string[]): Promise<TossStockInfo[]> {
  requireTossConfigured();
  const list = Array.from(new Set(symbols.map((s) => s.trim()).filter(Boolean))).slice(0, 200);
  if (!list.length) return [];
  const data = await tossFetch<unknown>("/api/v1/stocks", {
    searchParams: { symbols: list.join(",") },
  });
  const result = unwrapResult<unknown>(data);
  const rows = Array.isArray(result)
    ? result
    : result && typeof result === "object" && Array.isArray((result as { stocks?: unknown }).stocks)
      ? ((result as { stocks: unknown[] }).stocks)
      : [];
  return rows.map(parseStockInfo).filter((x): x is TossStockInfo => x != null);
}

export async function fetchTossStockMap(symbols: string[]): Promise<Map<string, TossStockInfo>> {
  const map = new Map<string, TossStockInfo>();
  const unique = Array.from(
    new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))
  );
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const res = await tossSafe(`stocks:${chunk.length}`, () => fetchTossStocks(chunk));
    if (!res.ok) continue;
    for (const row of res.data) {
      map.set(row.symbol.trim().toUpperCase(), row);
    }
  }
  return map;
}

/** GET /api/v1/stocks/{symbol}/warnings */
export async function fetchTossStockWarnings(symbol: string): Promise<TossStockWarning[]> {
  requireTossConfigured();
  const s = symbol.trim();
  if (!s) return [];
  const data = await tossFetch<unknown>(`/api/v1/stocks/${encodeURIComponent(s)}/warnings`);
  const result = unwrapResult<unknown>(data);
  const rows = Array.isArray(result) ? result : [];
  return rows
    .map((row) => parseStockWarning(s, row))
    .filter((x): x is TossStockWarning => x != null);
}

/** GET /api/v1/market-calendar/{country} */
export async function fetchTossMarketCalendar(
  country: TossMarketCountry,
  date?: string
): Promise<TossMarketCalendar> {
  requireTossConfigured();
  const data = await tossFetch<unknown>(`/api/v1/market-calendar/${country}`, {
    searchParams: date ? { date } : undefined,
  });
  return parseMarketCalendar(country, data);
}

/** Batch warnings with concurrency limit (rate-limit friendly) */
export async function fetchTossWarningsForSymbols(
  symbols: string[],
  options?: { concurrency?: number; delayMs?: number }
): Promise<Map<string, TossStockWarning[]>> {
  const concurrency = Math.min(Math.max(options?.concurrency ?? 4, 1), 8);
  const delayMs = Math.max(options?.delayMs ?? 120, 0);
  const list = Array.from(new Set(symbols.map((s) => s.trim()).filter(Boolean)));
  const out = new Map<string, TossStockWarning[]>();
  let i = 0;

  async function worker() {
    while (i < list.length) {
      const idx = i++;
      const sym = list[idx]!;
      const res = await tossSafe(`warnings:${sym}`, () => fetchTossStockWarnings(sym));
      out.set(sym.toUpperCase(), res.ok ? res.data : []);
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, list.length || 1) }, () => worker()));
  return out;
}

// Re-export types used by older imports
export type {
  TossStockInfo,
  TossStockWarning,
  TossMarketCalendar,
} from "./types";
