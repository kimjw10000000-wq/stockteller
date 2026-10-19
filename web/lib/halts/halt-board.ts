import { haltEventMs, parseHaltEtMs } from "./elapsed";
import { countdownMs, formatCountdown, keepResumedCard } from "./halt-clock";
import { isKoreanHaltMarket } from "./realtime-filter";
import type { HaltKind } from "./halt-signals";
import type { TradeHaltItem } from "./nasdaq-trade-halts";

export type HaltCard = {
  ticker: string;
  name: string;
  nameKo?: string;
  market: string;
  kind: HaltKind;
  reasonCode: string;
  reasonLabel: string;
  haltedAt: number;
  resumedAt: number | null;
  /** 나스닥이 재개 시각을 적어 둔 경우. 5분 롤링 타이머와는 별개다. */
  scheduledResumeAt: number | null;
};

export type LiveHaltCard = {
  ticker: string;
  market: string;
  kind: HaltKind;
  haltedAt: number;
  resumedAt: number | null;
};

const NEWS_RSS = new Set(["T1", "T2", "T3"]);

/** LULD·변동성 완화. 이 카드는 Polygon만 만든다. */
export function isVolatilityReason(code: string): boolean {
  const c = code.trim().toUpperCase();
  if (!c) return false;
  if (c === "LUDP" || c.startsWith("LUDP")) return true;
  if (c === "LUDS" || c.startsWith("LUDS")) return true;
  if (c === "M" || c === "T5") return true;
  return c.startsWith("VI_");
}

export function isNewsRssCode(code: string): boolean {
  return NEWS_RSS.has(code.trim().toUpperCase());
}

function kindFromReason(code: string): HaltKind {
  return isVolatilityReason(code) ? "volatility" : "news";
}

function confirmedResumeMs(row: TradeHaltItem): number | null {
  const clock = (row.resumptionTradeTime ?? "").trim() || (row.resumptionQuoteTime ?? "").trim();
  if (!clock) return null;
  const date = (row.resumptionDate ?? "").trim() || row.haltDate;
  return parseHaltEtMs(date, clock);
}

/** 종목당 최신 나스닥 공지 한 줄. */
function latestRssByTicker(rss: TradeHaltItem[]): Map<string, TradeHaltItem> {
  const map = new Map<string, TradeHaltItem>();
  for (const row of rss) {
    if (isKoreanHaltMarket(row.market)) continue;
    const ticker = row.symbol.trim().toUpperCase();
    if (!ticker) continue;
    const prev = map.get(ticker);
    if (!prev || haltEventMs(row) >= haltEventMs(prev)) map.set(ticker, row);
  }
  return map;
}

/** Polygon 신호가 없을 때, 그 종목의 최신 변동성 공지 한 장. 거래 재개 시각이 있으면 재개로 둔다. */
function volatilityRssCard(row: TradeHaltItem, now: number): HaltCard | null {
  const haltedAt = haltEventMs(row);
  if (!(haltedAt > 0)) return null;
  const trade = (row.resumptionTradeTime ?? "").trim();
  const resumeMs = trade ? parseHaltEtMs((row.resumptionDate ?? "").trim() || row.haltDate, trade) : null;
  const resumedAt = resumeMs != null && resumeMs <= now ? resumeMs : null;
  if (resumedAt != null && !keepResumedCard(haltedAt, resumedAt, now)) return null;
  return {
    ticker: row.symbol.trim().toUpperCase(),
    name: row.name?.trim() || row.symbol,
    ...(row.nameKo ? { nameKo: row.nameKo } : {}),
    market: row.market || "",
    kind: "volatility",
    reasonCode: row.reasonCode,
    reasonLabel: row.reasonLabel,
    haltedAt,
    resumedAt,
    scheduledResumeAt: null,
  };
}

/**
 * T1·T2·T3는 재개 시각이 없어도 올린다.
 * 그 밖은 재개 시각이 적혀 있을 때만 올린다.
 * 변동성 코드는 volatilityRssCard가 맡는다.
 */
function rssCard(row: TradeHaltItem, now: number): HaltCard | null {
  if (isVolatilityReason(row.reasonCode)) return null;
  const scheduled = confirmedResumeMs(row);
  if (!isNewsRssCode(row.reasonCode) && scheduled == null) return null;
  const haltedAt = haltEventMs(row);
  if (!(haltedAt > 0)) return null;
  const resumedAt = scheduled != null && scheduled <= now ? scheduled : null;
  if (resumedAt != null && !keepResumedCard(haltedAt, resumedAt, now)) return null;
  return {
    ticker: row.symbol.trim().toUpperCase(),
    name: row.name?.trim() || row.symbol,
    ...(row.nameKo ? { nameKo: row.nameKo } : {}),
    market: row.market || "",
    kind: kindFromReason(row.reasonCode),
    reasonCode: row.reasonCode,
    reasonLabel: row.reasonLabel,
    haltedAt,
    resumedAt,
    scheduledResumeAt: resumedAt == null ? scheduled : null,
  };
}

function withRssName(card: HaltCard, prev: HaltCard | undefined): HaltCard {
  if (!prev) return card;
  return {
    ...card,
    name: prev.name && prev.name !== prev.ticker ? prev.name : card.name,
    ...(prev.nameKo ? { nameKo: prev.nameKo } : {}),
    market: card.market || prev.market,
  };
}

/** 같은 종목의 변동성 신호가 여러 번 와도 카드는 하나. 아직 재개 전이면 첫 시각을 유지한다. */
function oneVolatilityLive(rows: LiveHaltCard[]): LiveHaltCard[] {
  const map = new Map<string, LiveHaltCard>();
  for (const row of rows) {
    if (row.kind !== "volatility" || !(row.haltedAt > 0)) continue;
    const ticker = row.ticker.trim().toUpperCase();
    const prev = map.get(ticker);
    if (!prev) {
      map.set(ticker, { ...row, ticker });
      continue;
    }
    if (prev.resumedAt == null && row.resumedAt == null) {
      if (row.haltedAt < prev.haltedAt) map.set(ticker, { ...row, ticker });
      continue;
    }
    if (row.haltedAt >= prev.haltedAt) map.set(ticker, { ...row, ticker });
  }
  return [...map.values()];
}

/**
 * 종목당 카드 하나.
 * 열려 있는 변동성 정지는 Polygon이 이기고, 그 밖의 현재 상태는 나스닥 공지 최신 한 줄이다.
 */
export function mergeHaltCards(live: LiveHaltCard[], rss: TradeHaltItem[], now: number): HaltCard[] {
  const byTicker = new Map<string, HaltCard>();
  const names = new Map<string, HaltCard>();
  const volFallback = new Map<string, HaltCard>();
  for (const row of latestRssByTicker(rss).values()) {
    const ticker = row.symbol.trim().toUpperCase();
    const card = isVolatilityReason(row.reasonCode) ? volatilityRssCard(row, now) : rssCard(row, now);
    names.set(ticker, card ?? {
      ticker,
      name: row.name?.trim() || row.symbol,
      ...(row.nameKo ? { nameKo: row.nameKo } : {}),
      market: row.market || "",
      kind: "news",
      reasonCode: row.reasonCode,
      reasonLabel: row.reasonLabel,
      haltedAt: 0,
      resumedAt: null,
      scheduledResumeAt: null,
    });
    if (!card) continue;
    if (card.kind === "volatility") volFallback.set(ticker, card);
    else byTicker.set(ticker, card);
  }
  for (const row of oneVolatilityLive(live)) {
    const prev = byTicker.get(row.ticker) ?? names.get(row.ticker);
    const liveOpen = row.resumedAt == null;
    if (!liveOpen && !keepResumedCard(row.haltedAt, row.resumedAt, now)) continue;
    if (!liveOpen && prev && prev.resumedAt == null && prev.haltedAt >= row.haltedAt) continue;
    if (liveOpen && prev && prev.kind === "news" && prev.haltedAt > row.haltedAt) continue;
    if (liveOpen && prev?.resumedAt != null && prev.resumedAt >= row.haltedAt) continue;
    const card: HaltCard = {
      ticker: row.ticker,
      name: row.ticker,
      market: row.market || "",
      kind: "volatility",
      reasonCode: prev?.reasonCode && isVolatilityReason(prev.reasonCode) ? prev.reasonCode : "LUDP",
      reasonLabel: prev?.reasonLabel && isVolatilityReason(prev.reasonCode) ? prev.reasonLabel : "",
      haltedAt: row.haltedAt,
      resumedAt: row.resumedAt,
      scheduledResumeAt: null,
    };
    byTicker.set(row.ticker, withRssName(card, prev));
  }
  for (const [ticker, card] of volFallback) {
    if (!byTicker.has(ticker)) byTicker.set(ticker, card);
  }
  return [...byTicker.values()].sort((a, b) => {
    const aOpen = a.resumedAt == null ? 1 : 0;
    const bOpen = b.resumedAt == null ? 1 : 0;
    if (aOpen !== bOpen) return bOpen - aOpen;
    return b.haltedAt - a.haltedAt;
  });
}

export function haltCardFace(card: HaltCard, now: number): { resumed: boolean; timed: boolean; countdown: string } {
  if (card.resumedAt != null && card.resumedAt <= now) {
    return { resumed: true, timed: false, countdown: "" };
  }
  const scheduled = card.scheduledResumeAt;
  if (scheduled != null && scheduled <= now) {
    return { resumed: true, timed: false, countdown: "" };
  }
  if (card.kind === "volatility") {
    return { resumed: false, timed: true, countdown: formatCountdown(countdownMs(card.haltedAt, now)) };
  }
  if (scheduled != null) {
    return { resumed: false, timed: true, countdown: formatCountdown(scheduled - now) };
  }
  return { resumed: false, timed: false, countdown: "" };
}

export function openHaltCount(cards: HaltCard[], now: number): number {
  return cards.filter((card) => !haltCardFace(card, now).resumed).length;
}
