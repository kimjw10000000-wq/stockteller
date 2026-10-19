import { parseHaltEtMs } from "./elapsed";
import type { TradeHaltItem } from "./nasdaq-trade-halts";

const ET = "America/New_York";
/** US after-hours session typically ends 20:00 ET */
export const US_AFTERMARKET_CLOSE_HOUR_ET = 20;

function etParts(ms: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const hourRaw = map.hour === "24" ? "0" : map.hour;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(hourRaw),
    minute: Number(map.minute),
  };
}

function ymdKey(y: number, m: number, d: number): number {
  return y * 10_000 + m * 100 + d;
}

function parseHaltDateKey(haltDate: string): number | null {
  const dm = haltDate.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!dm) return null;
  return ymdKey(Number(dm[3]), Number(dm[1]), Number(dm[2]));
}

/**
 * NASDAQ/NYSE: LUDP (Volatility Trading Pause)
 * AMEX: M (Volatility Trading Pause)
 * Do not treat M1 / T5 / T1 / T12 as this class.
 */
export function isVolatilityTradingPauseCode(reasonCode: string): boolean {
  const c = reasonCode.trim().toUpperCase();
  if (!c) return false;
  if (c === "LUDP" || c.startsWith("LUDP")) return true;
  return c === "M";
}

const KOREAN_HALT_MARKETS = new Set(["KOSPI", "KOSDAQ", "KONEX", "KRX", "KR"]);

/** 코스피·코스닥·코넥스. 미국 TradeHalt 카드에는 넣지 않는다. */
export function isKoreanHaltMarket(market: string | null | undefined): boolean {
  const m = (market ?? "").trim().toUpperCase();
  if (!m || m === "—") return false;
  if (KOREAN_HALT_MARKETS.has(m)) return true;
  return m.startsWith("KOSPI") || m.startsWith("KOSDAQ") || m.startsWith("KONEX");
}

export function isHaltTradeResumed(row: Pick<TradeHaltItem, "resumptionTradeTime">): boolean {
  return Boolean((row.resumptionTradeTime ?? "").trim());
}

/** RSS에 거래 재개 시각이 있고, 그 시각이 이미 지났으면 당일 해제 완료. */
export function hasCompletedTradeResumption(
  row: Pick<TradeHaltItem, "haltDate" | "resumptionDate" | "resumptionTradeTime">,
  nowMs = Date.now()
): boolean {
  const tradeTime = (row.resumptionTradeTime ?? "").trim();
  if (!tradeTime) return false;
  const date = (row.resumptionDate ?? "").trim() || row.haltDate;
  const ms = parseHaltEtMs(date, tradeTime);
  if (ms == null) return true;
  return nowMs >= ms;
}

/** True once the halt day's US aftermarket (20:00 ET) has ended, or a later ET calendar day. */
export function isPastUsAftermarketClose(
  haltDate: string,
  nowMs = Date.now()
): boolean {
  const haltKey = parseHaltDateKey(haltDate);
  const now = etParts(nowMs);
  const nowKey = ymdKey(now.year, now.month, now.day);
  if (haltKey == null) {
    const ms = parseHaltEtMs(haltDate, "00:00:00");
    if (ms == null) return false;
    const p = etParts(ms);
    const key = ymdKey(p.year, p.month, p.day);
    if (nowKey > key) return true;
    if (nowKey < key) return false;
    return now.hour >= US_AFTERMARKET_CLOSE_HOUR_ET;
  }
  if (nowKey > haltKey) return true;
  if (nowKey < haltKey) return false;
  return now.hour >= US_AFTERMARKET_CLOSE_HOUR_ET;
}

/**
 * Default realtime view: drop same-day-resumed LUDP/M after aftermarket close.
 * T1 / T12 / other unresolved or non-volatility halts stay.
 */
export function shouldHideFromRealtimeHaltView(
  row: Pick<TradeHaltItem, "reasonCode" | "haltDate" | "resumptionDate" | "resumptionTradeTime">,
  nowMs = Date.now()
): boolean {
  if (!isVolatilityTradingPauseCode(row.reasonCode)) return false;
  if (!hasCompletedTradeResumption(row, nowMs)) return false;
  return isPastUsAftermarketClose(row.haltDate, nowMs);
}

export function filterRealtimeHaltItems<
  T extends Pick<TradeHaltItem, "reasonCode" | "haltDate" | "resumptionDate" | "resumptionTradeTime"> & {
    market?: string | null;
  },
>(items: T[], nowMs = Date.now()): T[] {
  return items.filter(
    (row) => !isKoreanHaltMarket(row.market) && !shouldHideFromRealtimeHaltView(row, nowMs)
  );
}
