import { createPublicClient } from "@/lib/supabase/public";
import {
  DEFAULT_SIGNAL_STATUS,
  readSignalFromGeminiMetadata,
  type SignalStatus,
} from "@/lib/signal-status";
import type { SupabaseClient } from "@supabase/supabase-js";

/** 종목코드/티커 비교용 정규화 (KR 숫자 코드 · US 티커) */
export function normalizeStockCode(code: string): string {
  const trimmed = code.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  return trimmed.toUpperCase();
}

/** disclosures 행에서 종목코드(티커) 추출 */
export function resolveDisclosureStockCode(item: {
  stock_code?: string | null;
  gemini_metadata?: Record<string, unknown> | null;
  stocks?: { ticker?: string | null } | null;
}): string | null {
  const meta = item.gemini_metadata;
  const raw =
    item.stock_code ??
    item.stocks?.ticker ??
    (typeof meta?.stock_code === "string" ? meta.stock_code : null);
  if (!raw || !String(raw).trim()) return null;
  return normalizeStockCode(String(raw));
}

export function rowMatchesStockCode(
  row: {
    stock_code?: string | null;
    gemini_metadata?: Record<string, unknown> | null;
    stocks?: { ticker?: string | null } | null;
  },
  stockCode: string
): boolean {
  const key = normalizeStockCode(stockCode);
  const rowCode = resolveDisclosureStockCode(row);
  return rowCode !== null && rowCode === key;
}

type DisclosureSignalRow = {
  id: string;
  gemini_metadata: Record<string, unknown> | null;
  stock_code?: string | null;
  created_at?: string | null;
  stocks?: { ticker?: string | null } | null;
};

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

/** 동일 종목코드 disclosures 조회 (gemini_metadata · stocks.ticker · stock_code) */
export async function findDisclosuresByStockCode(
  stockCode: string,
  client: SupabaseClient
): Promise<DisclosureSignalRow[]> {
  const key = normalizeStockCode(stockCode);
  const seen = new Map<string, DisclosureSignalRow>();

  const { data: byMeta, error: metaErr } = await client
    .from("disclosures")
    .select("id, gemini_metadata, stock_code, created_at, stocks(ticker)")
    .eq("gemini_metadata->>stock_code", key);

  if (metaErr) {
    console.error("[stock-signal] meta query", metaErr.code, metaErr.message);
  } else {
    for (const row of byMeta ?? []) {
      seen.set(row.id, row as DisclosureSignalRow);
    }
  }

  const { data: byTicker, error: tickerErr } = await client
    .from("disclosures")
    .select("id, gemini_metadata, stock_code, created_at, stocks!inner(ticker)")
    .eq("stocks.ticker", key);

  if (tickerErr) {
    console.error("[stock-signal] ticker query", tickerErr.code, tickerErr.message);
  } else {
    for (const row of byTicker ?? []) {
      seen.set(row.id, row as DisclosureSignalRow);
    }
  }

  const { data: byCol, error: colErr } = await client
    .from("disclosures")
    .select("id, gemini_metadata, stock_code, created_at, stocks(ticker)")
    .eq("stock_code", key);

  if (!colErr) {
    for (const row of byCol ?? []) {
      seen.set(row.id, row as DisclosureSignalRow);
    }
  }

  return Array.from(seen.values());
}

/** 종목코드 기준 시그널 (공개 조회) */
export async function getSignalStatusForStockCode(stockCode: string): Promise<SignalStatus> {
  let client;
  try {
    client = createPublicClient();
  } catch {
    return DEFAULT_SIGNAL_STATUS;
  }

  const rows = await findDisclosuresByStockCode(stockCode, client);
  return resolveLatestSignalFromRows(rows);
}
