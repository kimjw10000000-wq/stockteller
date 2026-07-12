import { createPublicClient } from "@/lib/supabase/public";
import { disclosureMarket, disclosureStockLabel } from "@/lib/news-display";
import {
  DEFAULT_SIGNAL_STATUS,
  readSignalFromGeminiMetadata,
  type SignalStatus,
} from "@/lib/signal-status";
import type { DisclosureWithStock } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type StockIdentity = {
  stockCode: string | null;
  stockName: string | null;
  ticker: string | null;
};

/** 국가별 동일 종목 — KR: 코드+이름 / US: 티커+이름 (제목·본문·날짜 무관) */
export type StockMatchContext = StockIdentity & {
  market: "us" | "kr" | "unknown";
};

type DisclosureLike = {
  stock_code?: string | null;
  stock_name?: string | null;
  market_type?: string | null;
  gemini_metadata?: Record<string, unknown> | null;
  stocks?: { name?: string | null; ticker?: string | null; market?: string | null } | null;
};

type DisclosureSignalRow = DisclosureLike & {
  id: string;
  gemini_metadata: Record<string, unknown> | null;
  created_at?: string | null;
};

const SELECT_FIELDS =
  "id, gemini_metadata, stock_code, stock_name, market_type, created_at, stocks(name, ticker, market)" as const;

export function normalizeStockCode(code: string): string {
  const trimmed = code.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  return trimmed.toUpperCase();
}

export function normalizeStockName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function stockNamesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const left = normalizeStockName(a);
  const right = normalizeStockName(b);
  return left === right || left.toLowerCase() === right.toLowerCase();
}

export function resolveDisclosureStockIdentity(item: DisclosureLike): StockIdentity {
  const meta = item.gemini_metadata;

  const rawCode =
    item.stock_code ??
    (typeof meta?.stock_code === "string" ? meta.stock_code : null);

  const rawName =
    item.stock_name ??
    item.stocks?.name ??
    (typeof meta?.stock_name === "string" ? meta.stock_name : null);

  const rawTicker =
    item.stocks?.ticker ??
    (typeof meta?.ticker === "string" ? meta.ticker : null) ??
    rawCode ??
    (typeof meta?.stock_code === "string" ? meta.stock_code : null);

  return {
    stockCode: rawCode && String(rawCode).trim() ? normalizeStockCode(String(rawCode)) : null,
    stockName: rawName && String(rawName).trim() ? normalizeStockName(String(rawName)) : null,
    ticker: rawTicker && String(rawTicker).trim() ? normalizeStockCode(String(rawTicker)) : null,
  };
}

export function resolveDisclosureStockCode(item: DisclosureLike): string | null {
  return resolveDisclosureStockIdentity(item).stockCode;
}

export function enrichStockIdentity(item: DisclosureWithStock): StockIdentity {
  const identity = resolveDisclosureStockIdentity(item);
  const { stock, name } = disclosureStockLabel(item);

  if (!identity.stockName && name && name !== "종목 미상" && name !== "편집" && name !== "사이트 소식") {
    identity.stockName = normalizeStockName(name);
  }
  if (!identity.stockCode && stock && stock !== "—" && stock !== "편집") {
    identity.stockCode = normalizeStockCode(stock);
  }
  if (!identity.ticker && stock && stock !== "—" && stock !== "편집") {
    identity.ticker = normalizeStockCode(stock);
  }

  return identity;
}

export function enrichStockMatchContext(item: DisclosureWithStock): StockMatchContext {
  const identity = enrichStockIdentity(item);
  const market = disclosureMarket(item);
  const { stock, name } = disclosureStockLabel(item);

  if (!identity.stockName && name && name !== "종목 미상" && name !== "편집" && name !== "사이트 소식") {
    identity.stockName = normalizeStockName(name);
  }
  if (market === "kr" || (market === "unknown" && identity.stockCode && /^\d+$/.test(identity.stockCode))) {
    if (!identity.stockCode && stock && stock !== "—" && stock !== "편집") {
      identity.stockCode = normalizeStockCode(stock);
    }
    if (!identity.ticker && identity.stockCode) identity.ticker = identity.stockCode;
  } else {
    if (!identity.ticker && stock && stock !== "—" && stock !== "편집") {
      identity.ticker = normalizeStockCode(stock);
    }
    if (!identity.stockCode && identity.ticker) identity.stockCode = identity.ticker;
  }

  return { market, ...identity };
}

export function resolveEffectiveMarket(ctx: StockMatchContext): "us" | "kr" {
  if (ctx.market === "us" || ctx.market === "kr") return ctx.market;
  if (ctx.stockCode && /^\d+$/.test(ctx.stockCode)) return "kr";
  return "us";
}

export function matchContextIsComplete(ctx: StockMatchContext): boolean {
  if (!ctx.stockName) return false;
  return resolveEffectiveMarket(ctx) === "kr" ? !!ctx.stockCode : !!ctx.ticker;
}

export function stockIdentityHasKeys(identity: StockIdentity): boolean {
  return matchContextIsComplete({ market: "unknown", ...identity });
}

export function stockIdentityKey(identity: StockIdentity | StockMatchContext): string {
  const market = "market" in identity ? identity.market : "unknown";
  return [market, identity.stockCode ?? "", identity.stockName ?? "", identity.ticker ?? ""].join("|");
}

/** 제목·본문·날짜 무시 — 오직 종목이름 + (코드|티커) AND 매칭 */
export function rowMatchesStockContext(row: DisclosureLike, ctx: StockMatchContext): boolean {
  if (!ctx.stockName) return false;

  const rowIdentity = resolveDisclosureStockIdentity(row);
  if (!stockNamesEqual(ctx.stockName, rowIdentity.stockName)) return false;

  const market = resolveEffectiveMarket(ctx);
  if (market === "kr") {
    if (!ctx.stockCode) return false;
    const rowCode = rowIdentity.stockCode ?? rowIdentity.ticker;
    return !!rowCode && normalizeStockCode(rowCode) === normalizeStockCode(ctx.stockCode);
  }

  if (!ctx.ticker) return false;
  const rowTicker = rowIdentity.ticker ?? rowIdentity.stockCode;
  return !!rowTicker && normalizeStockCode(rowTicker) === normalizeStockCode(ctx.ticker);
}

export function rowMatchesStockIdentity(row: DisclosureLike, identity: StockIdentity): boolean {
  return rowMatchesStockContext(row, { market: "unknown", ...identity });
}

export function rowMatchesStockCode(row: DisclosureLike, stockCode: string): boolean {
  return rowMatchesStockContext(row, {
    market: /^\d+$/.test(stockCode) ? "kr" : "us",
    stockCode: normalizeStockCode(stockCode),
    stockName: null,
    ticker: normalizeStockCode(stockCode),
  });
}

function resolveLatestSignalFromRows(rows: DisclosureSignalRow[]): SignalStatus {
  let best: { status: SignalStatus; ts: number } | null = null;

  for (const row of rows) {
    const status = readSignalFromGeminiMetadata(row.gemini_metadata);
    if (!status) continue;

    const meta = row.gemini_metadata;
    const updatedRaw =
      typeof meta?.signal_updated_at === "string" ? meta.signal_updated_at : row.created_at;
    const ts = updatedRaw ? Date.parse(updatedRaw) : 0;
    if (!best || ts >= best.ts) {
      best = { status, ts };
    }
  }

  return best?.status ?? DEFAULT_SIGNAL_STATUS;
}

function mergeRows(seen: Map<string, DisclosureSignalRow>, rows: DisclosureSignalRow[] | null) {
  for (const row of rows ?? []) {
    seen.set(row.id, row);
  }
}

async function selectBy(
  client: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apply: (q: any) => any
): Promise<DisclosureSignalRow[]> {
  try {
    const { data, error } = await apply(client.from("disclosures").select(SELECT_FIELDS));
    if (error) {
      console.warn("[stock-signal] select", error.code, error.message);
      return [];
    }
    return (data ?? []) as DisclosureSignalRow[];
  } catch (err) {
    console.warn("[stock-signal] select exception", err);
    return [];
  }
}

/**
 * 제목·본문·날짜·뉴스 ID 완전 배제.
 * KR: 종목코드 + 주식이름 / US: 티커 + 주식이름 이 같은 모든 행.
 */
export async function findDisclosuresByStockContext(
  ctx: StockMatchContext,
  client: SupabaseClient,
  ensureId?: string
): Promise<DisclosureSignalRow[]> {
  const seen = new Map<string, DisclosureSignalRow>();
  const market = resolveEffectiveMarket(ctx);
  const symbol = market === "kr" ? ctx.stockCode : ctx.ticker;
  const name = ctx.stockName ? normalizeStockName(ctx.stockName) : null;

  if (!symbol || !name) {
    if (ensureId) {
      const { data } = await client.from("disclosures").select(SELECT_FIELDS).eq("id", ensureId).maybeSingle();
      return data ? [data as DisclosureSignalRow] : [];
    }
    return [];
  }

  // 심볼(코드/티커)로 후보 수집 — 제목/본문/날짜 조건 없음
  const symbolQueries = await Promise.all([
    selectBy(client, (q) => q.eq("gemini_metadata->>stock_code", symbol)),
    selectBy(client, (q) => q.eq("gemini_metadata->>ticker", symbol)),
    selectBy(client, (q) => q.eq("stock_code", symbol)),
    selectBy(client, (q) => q.eq("stocks.ticker", symbol)),
  ]);
  for (const rows of symbolQueries) mergeRows(seen, rows);

  // 주식이름으로도 후보 수집 (필드 위치가 다른 과거 행 포함)
  const nameQueries = await Promise.all([
    selectBy(client, (q) => q.eq("gemini_metadata->>stock_name", name)),
    selectBy(client, (q) => q.eq("stock_name", name)),
    selectBy(client, (q) => q.eq("stocks.name", name)),
  ]);
  for (const rows of nameQueries) mergeRows(seen, rows);

  // AND: 이름 + (코드|티커)만 — 제목·본문·날짜는 비교하지 않음
  const matched = Array.from(seen.values()).filter((row) => rowMatchesStockContext(row, ctx));

  if (ensureId && !matched.some((r) => r.id === ensureId)) {
    const { data } = await client.from("disclosures").select(SELECT_FIELDS).eq("id", ensureId).maybeSingle();
    if (data) matched.push(data as DisclosureSignalRow);
  }

  return matched;
}

export async function findDisclosuresByStockIdentity(
  identity: StockIdentity,
  client: SupabaseClient,
  ensureId?: string
): Promise<DisclosureSignalRow[]> {
  return findDisclosuresByStockContext({ market: "unknown", ...identity }, client, ensureId);
}

export async function findDisclosuresByStockCode(
  stockCode: string,
  client: SupabaseClient
): Promise<DisclosureSignalRow[]> {
  return findDisclosuresByStockContext(
    {
      market: /^\d+$/.test(stockCode) ? "kr" : "us",
      stockCode,
      stockName: null,
      ticker: stockCode,
    },
    client
  );
}

export async function getSignalStatusForStockContext(
  ctx: StockMatchContext,
  ensureId?: string
): Promise<SignalStatus> {
  let client;
  try {
    client = createPublicClient();
  } catch {
    return DEFAULT_SIGNAL_STATUS;
  }

  const rows = await findDisclosuresByStockContext(ctx, client, ensureId);
  return resolveLatestSignalFromRows(rows);
}

export async function getSignalStatusForStockIdentity(
  identity: StockIdentity,
  ensureId?: string
): Promise<SignalStatus> {
  return getSignalStatusForStockContext({ market: "unknown", ...identity }, ensureId);
}

export async function getSignalStatusForStockCode(stockCode: string): Promise<SignalStatus> {
  return getSignalStatusForStockIdentity({ stockCode, stockName: null, ticker: stockCode });
}
