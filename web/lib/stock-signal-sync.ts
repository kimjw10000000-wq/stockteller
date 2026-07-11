import { createPublicClient } from "@/lib/supabase/public";
import { disclosureStockLabel } from "@/lib/news-display";
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

type DisclosureLike = {
  stock_code?: string | null;
  stock_name?: string | null;
  gemini_metadata?: Record<string, unknown> | null;
  stocks?: { name?: string | null; ticker?: string | null } | null;
};

type DisclosureSignalRow = {
  id: string;
  gemini_metadata: Record<string, unknown> | null;
  stock_code?: string | null;
  stock_name?: string | null;
  created_at?: string | null;
  stocks?: { name?: string | null; ticker?: string | null } | null;
};

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

/** disclosures 행에서 종목코드(티커) 추출 */
export function resolveDisclosureStockCode(item: DisclosureLike): string | null {
  return resolveDisclosureStockIdentity(item).stockCode;
}

/** disclosures 행에서 종목코드 · 주식이름 · 티커 추출 */
export function resolveDisclosureStockIdentity(item: DisclosureLike): StockIdentity {
  const meta = item.gemini_metadata;

  const rawCode =
    item.stock_code ??
    item.stocks?.ticker ??
    (typeof meta?.stock_code === "string" ? meta.stock_code : null);

  const rawName =
    item.stock_name ??
    item.stocks?.name ??
    (typeof meta?.stock_name === "string" ? meta.stock_name : null);

  const rawTicker =
    item.stocks?.ticker ??
    item.stock_code ??
    (typeof meta?.stock_code === "string" ? meta.stock_code : null) ??
    (typeof meta?.ticker === "string" ? meta.ticker : null);

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
  if (!identity.ticker && identity.stockCode) {
    identity.ticker = identity.stockCode;
  }

  return identity;
}

export function stockIdentityHasKeys(identity: StockIdentity): boolean {
  return !!(identity.stockCode || identity.stockName || identity.ticker);
}

export function stockIdentityKey(identity: StockIdentity): string {
  return [identity.stockCode ?? "", identity.stockName ?? "", identity.ticker ?? ""].join("|");
}

export function rowMatchesStockCode(row: DisclosureLike, stockCode: string): boolean {
  return rowMatchesStockIdentity(row, { stockCode, stockName: null, ticker: null });
}

/** 종목코드 · 주식이름 · 티커 중 하나라도 일치하면 동일 종목 */
export function rowMatchesStockIdentity(row: DisclosureLike, identity: StockIdentity): boolean {
  if (!stockIdentityHasKeys(identity)) return false;

  const rowIdentity = resolveDisclosureStockIdentity(row);

  const codes = new Set(
    [identity.stockCode, identity.ticker].filter((v): v is string => !!v)
  );
  const rowCodes = new Set(
    [rowIdentity.stockCode, rowIdentity.ticker].filter((v): v is string => !!v)
  );

  for (const code of Array.from(codes)) {
    if (rowCodes.has(code)) return true;
  }

  if (identity.stockName && rowIdentity.stockName) {
    if (normalizeStockName(identity.stockName) === normalizeStockName(rowIdentity.stockName)) {
      return true;
    }
  }

  return false;
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

/** 종목코드 · 주식이름 · 티커 OR 조건으로 disclosures 조회 */
export async function findDisclosuresByStockIdentity(
  identity: StockIdentity,
  client: SupabaseClient
): Promise<DisclosureSignalRow[]> {
  const seen = new Map<string, DisclosureSignalRow>();
  const select =
    "id, gemini_metadata, stock_code, stock_name, created_at, stocks(name, ticker)" as const;

  if (identity.stockCode) {
    const code = identity.stockCode;

    const { data, error } = await client
      .from("disclosures")
      .select(select)
      .eq("gemini_metadata->>stock_code", code);
    if (error) console.error("[stock-signal] meta stock_code", error.code, error.message);
    else mergeRows(seen, data as DisclosureSignalRow[]);

    const { data: byCol, error: colErr } = await client
      .from("disclosures")
      .select(select)
      .eq("stock_code", code);
    if (!colErr) mergeRows(seen, byCol as DisclosureSignalRow[]);

    const { data: byTicker, error: tickerErr } = await client
      .from("disclosures")
      .select(select)
      .eq("stocks.ticker", code);
    if (tickerErr) console.error("[stock-signal] stocks.ticker=code", tickerErr.code, tickerErr.message);
    else mergeRows(seen, byTicker as DisclosureSignalRow[]);
  }

  if (identity.ticker && identity.ticker !== identity.stockCode) {
    const ticker = identity.ticker;

    const { data, error } = await client
      .from("disclosures")
      .select(select)
      .eq("stocks.ticker", ticker);
    if (error) console.error("[stock-signal] stocks.ticker", error.code, error.message);
    else mergeRows(seen, data as DisclosureSignalRow[]);

    const { data: byMetaTicker, error: metaTickerErr } = await client
      .from("disclosures")
      .select(select)
      .eq("gemini_metadata->>ticker", ticker);
    if (!metaTickerErr) mergeRows(seen, byMetaTicker as DisclosureSignalRow[]);
  }

  if (identity.stockName) {
    const name = identity.stockName;

    const { data, error } = await client
      .from("disclosures")
      .select(select)
      .eq("gemini_metadata->>stock_name", name);
    if (error) console.error("[stock-signal] meta stock_name", error.code, error.message);
    else mergeRows(seen, data as DisclosureSignalRow[]);

    const { data: byCol, error: colErr } = await client
      .from("disclosures")
      .select(select)
      .eq("stock_name", name);
    if (!colErr) mergeRows(seen, byCol as DisclosureSignalRow[]);

    const { data: byStockName, error: stockNameErr } = await client
      .from("disclosures")
      .select(select)
      .eq("stocks.name", name);
    if (stockNameErr) {
      console.error("[stock-signal] stocks.name", stockNameErr.code, stockNameErr.message);
    } else {
      mergeRows(seen, byStockName as DisclosureSignalRow[]);
    }
  }

  return Array.from(seen.values());
}

/** @deprecated findDisclosuresByStockIdentity 사용 */
export async function findDisclosuresByStockCode(
  stockCode: string,
  client: SupabaseClient
): Promise<DisclosureSignalRow[]> {
  return findDisclosuresByStockIdentity({ stockCode, stockName: null, ticker: null }, client);
}

/** 종목 식별자(코드·이름·티커 OR) 기준 최신 시그널 */
export async function getSignalStatusForStockIdentity(
  identity: StockIdentity
): Promise<SignalStatus> {
  if (!stockIdentityHasKeys(identity)) return DEFAULT_SIGNAL_STATUS;

  let client;
  try {
    client = createPublicClient();
  } catch {
    return DEFAULT_SIGNAL_STATUS;
  }

  const rows = await findDisclosuresByStockIdentity(identity, client);
  return resolveLatestSignalFromRows(rows);
}

/** @deprecated getSignalStatusForStockIdentity 사용 */
export async function getSignalStatusForStockCode(stockCode: string): Promise<SignalStatus> {
  return getSignalStatusForStockIdentity({ stockCode, stockName: null, ticker: null });
}
