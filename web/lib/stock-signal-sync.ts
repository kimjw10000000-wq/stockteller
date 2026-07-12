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

/** 국가별 동일 종목 매칭 컨텍스트 — KR: 코드+이름 / US: 티커+이름 */
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

/** 종목코드/티커 비교용 정규화 (KR 숫자 코드 · US 티커) */
export function normalizeStockCode(code: string): string {
  const trimmed = code.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  return trimmed.toUpperCase();
}

/** 주식이름 비교용 정규화 */
export function normalizeStockName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function stockNamesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const left = normalizeStockName(a);
  const right = normalizeStockName(b);
  return left === right || left.toLowerCase() === right.toLowerCase();
}

/** disclosures 행에서 종목코드(티커) 추출 */
export function resolveDisclosureStockCode(item: DisclosureLike): string | null {
  return resolveDisclosureStockIdentity(item).stockCode;
}

/** disclosures 행에서 종목코드 · 주식이름 · 티커 추출 */
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

/** 컬럼·조인·라벨에서 누락된 종목 식별자 보강 */
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

/** 국가 + 종목 식별자 보강 */
export function enrichStockMatchContext(item: DisclosureWithStock): StockMatchContext {
  const identity = enrichStockIdentity(item);
  const market = disclosureMarket(item);
  const { stock, name } = disclosureStockLabel(item);

  if (market === "kr") {
    if (!identity.stockCode && stock && stock !== "—" && stock !== "편집") {
      identity.stockCode = normalizeStockCode(stock);
    }
    if (!identity.stockName && name) {
      identity.stockName = normalizeStockName(name);
    }
    if (!identity.ticker && identity.stockCode) {
      identity.ticker = identity.stockCode;
    }
  } else if (market === "us") {
    if (!identity.ticker && stock && stock !== "—" && stock !== "편집") {
      identity.ticker = normalizeStockCode(stock);
    }
    if (!identity.stockName && name) {
      identity.stockName = normalizeStockName(name);
    }
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
  const market = resolveEffectiveMarket(ctx);
  if (market === "kr") return !!ctx.stockCode;
  return !!ctx.ticker;
}

export function stockIdentityHasKeys(identity: StockIdentity): boolean {
  return matchContextIsComplete({ market: "unknown", ...identity });
}

export function stockIdentityKey(identity: StockIdentity | StockMatchContext): string {
  const market = "market" in identity ? identity.market : "unknown";
  return [market, identity.stockCode ?? "", identity.stockName ?? "", identity.ticker ?? ""].join("|");
}

export function rowMatchesStockCode(row: DisclosureLike, stockCode: string): boolean {
  const ctx: StockMatchContext = {
    market: /^\d+$/.test(stockCode) ? "kr" : "us",
    stockCode: normalizeStockCode(stockCode),
    stockName: null,
    ticker: normalizeStockCode(stockCode),
  };
  return rowMatchesStockContext(row, ctx);
}

/** KR: 코드+이름 / US: 티커+이름 AND 매칭 */
export function rowMatchesStockContext(row: DisclosureLike, ctx: StockMatchContext): boolean {
  if (!matchContextIsComplete(ctx)) return false;

  const rowIdentity = resolveDisclosureStockIdentity(row);
  if (!stockNamesEqual(ctx.stockName, rowIdentity.stockName)) return false;

  const market = resolveEffectiveMarket(ctx);

  if (market === "kr") {
    const rowCode = rowIdentity.stockCode ?? rowIdentity.ticker;
    return !!rowCode && normalizeStockCode(rowCode) === ctx.stockCode;
  }

  const rowTicker = rowIdentity.ticker ?? rowIdentity.stockCode;
  return !!rowTicker && normalizeStockCode(rowTicker) === ctx.ticker;
}

/** @deprecated rowMatchesStockContext 사용 */
export function rowMatchesStockIdentity(row: DisclosureLike, identity: StockIdentity): boolean {
  return rowMatchesStockContext(row, { market: "unknown", ...identity });
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

async function queryDisclosures(
  client: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apply: (q: any) => any
): Promise<DisclosureSignalRow[]> {
  const { data, error } = await apply(client.from("disclosures").select(SELECT_FIELDS));

  if (error) {
    console.error("[stock-signal] query", error.code, error.message);
    return [];
  }

  return (data ?? []) as DisclosureSignalRow[];
}

/** 국가별 AND 조건으로 disclosures 조회 후 클라이언트 필터 */
export async function findDisclosuresByStockContext(
  ctx: StockMatchContext,
  client: SupabaseClient,
  fallbackId?: string
): Promise<DisclosureSignalRow[]> {
  const seen = new Map<string, DisclosureSignalRow>();
  const market = resolveEffectiveMarket(ctx);

  if (market === "kr" && ctx.stockCode) {
    const code = ctx.stockCode;
    for (const rows of await Promise.all([
      queryDisclosures(client, (q) => q.eq("gemini_metadata->>stock_code", code)),
      queryDisclosures(client, (q) => q.eq("stock_code", code)),
      queryDisclosures(client, (q) => q.eq("stocks.ticker", code)),
    ])) {
      mergeRows(seen, rows);
    }
  } else if (ctx.ticker) {
    const ticker = ctx.ticker;
    for (const rows of await Promise.all([
      queryDisclosures(client, (q) => q.eq("stocks.ticker", ticker)),
      queryDisclosures(client, (q) => q.eq("gemini_metadata->>stock_code", ticker)),
      queryDisclosures(client, (q) => q.eq("gemini_metadata->>ticker", ticker)),
      queryDisclosures(client, (q) => q.eq("stock_code", ticker)),
    ])) {
      mergeRows(seen, rows);
    }
  }

  if (ctx.stockName) {
    const name = normalizeStockName(ctx.stockName);
    for (const rows of await Promise.all([
      queryDisclosures(client, (q) => q.eq("gemini_metadata->>stock_name", name)),
      queryDisclosures(client, (q) => q.eq("stock_name", name)),
      queryDisclosures(client, (q) => q.eq("stocks.name", name)),
    ])) {
      mergeRows(seen, rows);
    }
  }

  let matched = Array.from(seen.values()).filter((row) => rowMatchesStockContext(row, ctx));

  if (matched.length === 0 && fallbackId) {
    const { data, error } = await client
      .from("disclosures")
      .select(SELECT_FIELDS)
      .eq("id", fallbackId)
      .maybeSingle();

    if (!error && data) {
      matched = [data as DisclosureSignalRow];
    }
  }

  return matched;
}

/** @deprecated findDisclosuresByStockContext 사용 */
export async function findDisclosuresByStockIdentity(
  identity: StockIdentity,
  client: SupabaseClient,
  fallbackId?: string
): Promise<DisclosureSignalRow[]> {
  return findDisclosuresByStockContext({ market: "unknown", ...identity }, client, fallbackId);
}

/** @deprecated findDisclosuresByStockContext 사용 */
export async function findDisclosuresByStockCode(
  stockCode: string,
  client: SupabaseClient
): Promise<DisclosureSignalRow[]> {
  return findDisclosuresByStockContext(
    { market: /^\d+$/.test(stockCode) ? "kr" : "us", stockCode, stockName: null, ticker: stockCode },
    client
  );
}

/** 국가별 AND 매칭 그룹의 최신 시그널 */
export async function getSignalStatusForStockContext(
  ctx: StockMatchContext,
  fallbackId?: string
): Promise<SignalStatus> {
  if (!matchContextIsComplete(ctx)) return DEFAULT_SIGNAL_STATUS;

  let client;
  try {
    client = createPublicClient();
  } catch {
    return DEFAULT_SIGNAL_STATUS;
  }

  const rows = await findDisclosuresByStockContext(ctx, client, fallbackId);
  return resolveLatestSignalFromRows(rows);
}

/** @deprecated getSignalStatusForStockContext 사용 */
export async function getSignalStatusForStockIdentity(
  identity: StockIdentity,
  fallbackId?: string
): Promise<SignalStatus> {
  return getSignalStatusForStockContext({ market: "unknown", ...identity }, fallbackId);
}

/** @deprecated getSignalStatusForStockContext 사용 */
export async function getSignalStatusForStockCode(stockCode: string): Promise<SignalStatus> {
  return getSignalStatusForStockIdentity({ stockCode, stockName: null, ticker: stockCode });
}
