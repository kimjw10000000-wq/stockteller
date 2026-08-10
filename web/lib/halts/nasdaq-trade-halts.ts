import { haltEventMs } from "./elapsed";
import { haltReasonLabel } from "./reason-codes";

const RSS_URL = "https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts";

export type TradeHaltItem = {
  symbol: string;
  name: string;
  market: string;
  reasonCode: string;
  reasonLabel: string;
  haltDate: string;
  haltTime: string;
  pauseThresholdPrice: string | null;
  resumptionDate: string | null;
  resumptionQuoteTime: string | null;
  resumptionTradeTime: string | null;
  /** true when Resumption Trade Time is set (scheduled or done) */
  hasResumptionSchedule: boolean;
  status: "halted" | "resuming";
  /** nasdaq-rss | toss-vi */
  source?: "nasdaq-rss" | "toss-vi";
  /** Absolute event time for DESC sort / local display (Toss VI etc.) */
  eventAtIso?: string | null;
  englishName?: string | null;
  nameKo?: string | null;
  warningType?: string | null;
};

export type TradeHaltsResult = {
  items: TradeHaltItem[];
  fetchedAt: string;
  source: "nasdaq-rss" | "toss-vi" | "hybrid";
  count: number;
};

function tag(xml: string, name: string): string {
  const re = new RegExp(`<(?:ndaq:)?${name}[^>]*>([\\s\\S]*?)<\\/(?:ndaq:)?${name}>`, "i");
  const m = xml.match(re);
  return (m?.[1] ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

function emptyToNull(s: string): string | null {
  const t = s.trim();
  return t ? t : null;
}

function parseItems(xml: string): TradeHaltItem[] {
  const chunks = xml.split(/<item>/i).slice(1);
  const items: TradeHaltItem[] = [];

  for (const chunk of chunks) {
    const body = chunk.split(/<\/item>/i)[0] ?? "";
    const symbol = tag(body, "IssueSymbol") || tag(body, "title");
    if (!symbol) continue;

    const reasonCode = tag(body, "ReasonCode");
    const resumptionDate = emptyToNull(tag(body, "ResumptionDate"));
    const resumptionQuoteTime = emptyToNull(tag(body, "ResumptionQuoteTime"));
    const resumptionTradeTime = emptyToNull(tag(body, "ResumptionTradeTime"));
    const hasResumptionSchedule = Boolean(resumptionTradeTime || resumptionQuoteTime);

    items.push({
      symbol,
      name: tag(body, "IssueName"),
      market: tag(body, "Market"),
      reasonCode,
      reasonLabel: haltReasonLabel(reasonCode),
      haltDate: tag(body, "HaltDate"),
      haltTime: tag(body, "HaltTime"),
      pauseThresholdPrice: emptyToNull(tag(body, "PauseThresholdPrice")),
      resumptionDate,
      resumptionQuoteTime,
      resumptionTradeTime,
      hasResumptionSchedule,
      status: hasResumptionSchedule ? "resuming" : "halted",
      source: "nasdaq-rss",
      eventAtIso: null,
      englishName: null,
      nameKo: null,
      warningType: null,
    });
  }

  return items;
}

/** Newest Halt Date+Time first. */
function sortHalts(a: TradeHaltItem, b: TradeHaltItem): number {
  const am = haltEventMs(a);
  const bm = haltEventMs(b);
  if (bm !== am) return bm - am;
  return a.symbol.localeCompare(b.symbol);
}

export async function fetchNasdaqTradeHalts(): Promise<TradeHaltsResult> {
  // 캐시/TTL은 `halts-cache.ts`가 담당. Next Data Cache에 맡기지 않는다.
  const res = await fetch(RSS_URL, {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml, */*",
      "User-Agent": process.env.SEC_USER_AGENT?.trim() || "Whyup/1.0 (halts@whyup.net)",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`NASDAQ Trade Halt RSS ${res.status}`);
  }

  const xml = await res.text();
  const items = parseItems(xml).sort(sortHalts);

  return {
    items,
    fetchedAt: new Date().toISOString(),
    source: "nasdaq-rss",
    count: items.length,
  };
}
