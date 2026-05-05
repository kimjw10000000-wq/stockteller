import { createClient } from "@supabase/supabase-js";
import type { StockData } from "./types";

export async function upsertHighVolatility(row: StockData): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL(루트 URL)와 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.from("high_volatility_stocks").upsert(
    {
      market: row.market,
      ticker: row.ticker,
      name: row.name ?? null,
      currency: row.currency,
      last_price: row.lastPrice,
      prev_close: row.prevClose,
      change_pct: row.changePct,
      volume: Math.floor(row.volume),
      source: row.source,
      raw: row.raw ?? null,
      detected_at: new Date(row.timestamp).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "market,ticker" }
  );

  if (error) {
    console.error("[persist] upsert error", error.message);
    throw error;
  }
}

/** 마지막 저장 시각으로 스팸 방지 (같은 종목 minIntervalMs 이내면 생략) */
const lastSaved = new Map<string, number>();

export async function upsertHighVolatilityThrottled(
  row: StockData,
  minIntervalMs: number
): Promise<boolean> {
  const key = `${row.market}:${row.ticker}`;
  const now = Date.now();
  const prev = lastSaved.get(key) ?? 0;
  if (now - prev < minIntervalMs) return false;
  await upsertHighVolatility(row);
  lastSaved.set(key, now);
  return true;
}
