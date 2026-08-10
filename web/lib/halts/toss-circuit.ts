/**
 * Toss Open API → Halt/Resume 목록 포맷.
 *
 * 토스에는 "전체 거래정지 피드"가 없고,
 * - 종목별 warnings (VI/유의) `/api/v1/stocks/{symbol}/warnings`
 * - 종목 정보(거래정지 플래그 포함) `/api/v1/stocks`
 * 만 제공한다.
 *
 * 따라서 활성 랭킹 종목을 후보로 잡고 warnings·정지 플래그를 스캔한다.
 */

import { isTossConfigured } from "@/lib/toss/client";
import { fetchTossRankings } from "@/lib/toss/rankings";
import {
  fetchTossStockMap,
  fetchTossStockWarnings,
  type TossStockInfo,
  type TossStockWarning,
} from "@/lib/toss/stocks";
import type { TradeHaltItem, TradeHaltsResult } from "./nasdaq-trade-halts";
import { haltReasonLabel } from "./reason-codes";
import { haltEventMs } from "./elapsed";

const WARNING_LABELS: Record<string, string> = {
  VI_STATIC: "정적 VI (변동성완화)",
  VI_DYNAMIC: "동적 VI (변동성완화)",
  VI_STATIC_AND_DYNAMIC: "정적·동적 VI",
  OVERHEATED: "단기과열종목",
  INVESTMENT_WARNING: "투자경고",
  INVESTMENT_RISK: "투자위험",
  LIQUIDATION_TRADING: "정리매매",
  STOCK_WARRANTS: "신주인수권 유의",
  TRADING_SUSPENDED: "거래정지",
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isoToMmDdYyyyAndTime(iso: string | null | undefined): {
  haltDate: string;
  haltTime: string;
  eventAtIso: string | null;
} {
  if (!iso?.trim()) {
    const now = new Date();
    return {
      haltDate: `${now.getUTCMonth() + 1}/${now.getUTCDate()}/${now.getUTCFullYear()}`,
      haltTime: "00:00:00",
      eventAtIso: now.toISOString(),
    };
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    // YYYY-MM-DD only
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
    if (m) {
      const eventAtIso = `${m[1]}-${m[2]}-${m[3]}T00:00:00+09:00`;
      return {
        haltDate: `${Number(m[2])}/${Number(m[3])}/${m[1]}`,
        haltTime: "00:00:00",
        eventAtIso,
      };
    }
    return { haltDate: iso, haltTime: "00:00:00", eventAtIso: null };
  }
  // Display fields kept as US-style for existing cells; absolute sort uses eventAtIso
  const mm = d.getUTCMonth() + 1;
  const dd = d.getUTCDate();
  const yyyy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return {
    haltDate: `${mm}/${dd}/${yyyy}`,
    haltTime: `${hh}:${mi}:${ss}`,
    eventAtIso: d.toISOString(),
  };
}

function displayName(info: TossStockInfo | undefined, symbol: string): string {
  if (!info) return symbol;
  const ko = info.name?.trim();
  const en = info.englishName?.trim();
  if (ko && en && ko !== en) return `${ko} (${en})`;
  return ko || en || symbol;
}

function mapWarningToItem(
  symbol: string,
  warning: TossStockWarning,
  info: TossStockInfo | undefined
): TradeHaltItem {
  const code = (warning.warningType || "WARN").toUpperCase();
  const { haltDate, haltTime, eventAtIso } = isoToMmDdYyyyAndTime(warning.startDate);
  const ended = Boolean(warning.endDate);
  return {
    symbol,
    name: displayName(info, symbol),
    englishName: info?.englishName ?? null,
    nameKo: info?.name ?? null,
    market: info?.market || warning.exchange || "—",
    reasonCode: code,
    reasonLabel: WARNING_LABELS[code] ?? haltReasonLabel(code),
    haltDate,
    haltTime,
    pauseThresholdPrice: null,
    resumptionDate: ended ? warning.endDate : null,
    resumptionQuoteTime: null,
    resumptionTradeTime: ended ? "00:00:00" : null,
    hasResumptionSchedule: ended,
    status: ended ? "resuming" : "halted",
    source: "toss-vi",
    eventAtIso,
    warningType: code,
  };
}

function mapSuspendedToItem(info: TossStockInfo): TradeHaltItem {
  const { haltDate, haltTime, eventAtIso } = isoToMmDdYyyyAndTime(new Date().toISOString());
  return {
    symbol: info.symbol,
    name: displayName(info, info.symbol),
    englishName: info.englishName ?? null,
    nameKo: info.name ?? null,
    market: info.market || "—",
    reasonCode: "TRADING_SUSPENDED",
    reasonLabel: WARNING_LABELS.TRADING_SUSPENDED,
    haltDate,
    haltTime,
    pauseThresholdPrice: null,
    resumptionDate: null,
    resumptionQuoteTime: null,
    resumptionTradeTime: null,
    hasResumptionSchedule: false,
    status: "halted",
    source: "toss-vi",
    eventAtIso,
    warningType: "TRADING_SUSPENDED",
  };
}

function isSuspended(info: TossStockInfo): boolean {
  const d = info.koreanMarketDetail;
  if (!d) return false;
  return Boolean(d.krxTradingSuspended || d.nxtTradingSuspended || d.liquidationTrading);
}

async function collectCandidateSymbols(limit: number): Promise<string[]> {
  const out: string[] = [];
  const push = (syms: string[]) => {
    for (const s of syms) {
      const t = s.trim().toUpperCase();
      if (t && !out.includes(t)) out.push(t);
    }
  };

  const jobs = [
    fetchTossRankings({
      type: "MARKET_TRADING_VOLUME",
      marketCountry: "KR",
      duration: "realtime",
      count: Math.min(limit, 50),
    }),
    fetchTossRankings({
      type: "TOP_GAINERS",
      marketCountry: "KR",
      duration: "1d",
      count: Math.min(limit, 40),
    }),
    fetchTossRankings({
      type: "TOP_GAINERS",
      marketCountry: "US",
      duration: "1d",
      count: Math.min(limit, 30),
    }),
  ];

  const settled = await Promise.allSettled(jobs);
  for (const r of settled) {
    if (r.status === "fulfilled") {
      push(r.value.rankings.map((x) => x.symbol));
    }
  }
  return out.slice(0, limit);
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]!);
      await sleep(120);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

/**
 * Scan Toss rankings for active VI/유의/거래정지 → TradeHaltItem[].
 */
export async function fetchTossCircuitEvents(options?: {
  candidateLimit?: number;
}): Promise<TradeHaltsResult> {
  if (!isTossConfigured()) {
    throw new Error("TOSSINVEST_CLIENT_ID / TOSSINVEST_CLIENT_SECRET 미설정");
  }

  const candidateLimit = Math.min(Math.max(options?.candidateLimit ?? 40, 10), 80);
  const symbols = await collectCandidateSymbols(candidateLimit);
  const stockMap = await fetchTossStockMap(symbols);

  const items: TradeHaltItem[] = [];
  const seen = new Set<string>();

  for (const sym of symbols) {
    const info = stockMap.get(sym);
    if (info && isSuspended(info)) {
      const row = mapSuspendedToItem(info);
      const key = `${row.symbol}__${row.reasonCode}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push(row);
      }
    }
  }

  const warningResults = await mapPool(symbols, 4, async (sym) => {
    try {
      const warnings = await fetchTossStockWarnings(sym);
      return { sym, warnings };
    } catch {
      return { sym, warnings: [] as TossStockWarning[] };
    }
  });

  for (const { sym, warnings } of warningResults) {
    const info = stockMap.get(sym);
    for (const w of warnings) {
      const row = mapWarningToItem(sym, w, info);
      const key = `${row.symbol}__${row.reasonCode}__${row.haltDate}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push(row);
      }
    }
  }

  items.sort((a, b) => haltEventMs(b) - haltEventMs(a));

  return {
    items,
    fetchedAt: new Date().toISOString(),
    source: "toss-vi",
    count: items.length,
  };
}

/** Enrich NASDAQ RSS rows with Toss stock name/market. */
export async function enrichHaltsWithTossStocks(
  items: TradeHaltItem[]
): Promise<TradeHaltItem[]> {
  if (!isTossConfigured() || !items.length) return items;
  const map = await fetchTossStockMap(items.map((i) => i.symbol));
  return items.map((row) => {
    const info = map.get(row.symbol.trim().toUpperCase());
    if (!info) return { ...row, source: row.source ?? "nasdaq-rss" };
    return {
      ...row,
      name: displayName(info, row.symbol),
      englishName: info.englishName ?? row.englishName ?? null,
      nameKo: info.name ?? row.nameKo ?? null,
      market: info.market || row.market,
      source: row.source ?? "nasdaq-rss",
    };
  });
}
