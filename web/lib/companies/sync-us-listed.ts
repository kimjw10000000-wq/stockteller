import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchMarketCaps } from "./market-cap";
import { fetchSecExchangeTickers } from "./sec-exchange-tickers";
import { fetchNasdaqTraderExchanges } from "./nasdaq-trader-exchanges";
import {
  DEFAULT_NEWSWIRE_BATCH,
  refreshPrimaryNewswires,
  type NewswireSyncResult,
} from "./sync-newswire";
import { sleep } from "@/lib/sec/edgar-client";

const UPSERT_CHUNK = 500;
/** Per cron/run: rotate market-cap refresh for this many tickers */
const DEFAULT_MARKET_CAP_BATCH = 300;

export type UsListedSyncResult = {
  ok: boolean;
  secFetched: number;
  upserted: number;
  marketCapUpdated: number;
  marketCapBatchSize: number;
  newswire?: NewswireSyncResult;
  error?: string;
  durationMs: number;
};

async function upsertCompanies(
  admin: SupabaseClient,
  rows: Array<{
    ticker: string;
    name: string;
    cik: string;
    exchange: string;
    updated_at: string;
  }>
): Promise<number> {
  let n = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await admin.from("us_listed_companies").upsert(chunk, {
      onConflict: "ticker",
    });
    if (error) throw new Error(`us_listed_companies upsert: ${error.message}`);
    n += chunk.length;
  }
  return n;
}

async function refreshMarketCaps(
  admin: SupabaseClient,
  batchSize: number
): Promise<number> {
  const { data, error } = await admin
    .from("us_listed_companies")
    .select("ticker")
    .order("market_cap_updated_at", { ascending: true, nullsFirst: true })
    .limit(batchSize);

  if (error) throw new Error(`market_cap select: ${error.message}`);
  const tickers = (data ?? []).map((r) => String((r as { ticker: string }).ticker));
  if (!tickers.length) return 0;

  let updated = 0;
  const yahooChunk = 40;
  const now = new Date().toISOString();

  for (let i = 0; i < tickers.length; i += yahooChunk) {
    const slice = tickers.slice(i, i + yahooChunk);
    const caps = await fetchMarketCaps(slice, { preferFinnhubFallback: false });

    for (const ticker of slice) {
      const market_cap = caps.get(ticker) ?? null;
      const { error: upErr } = await admin
        .from("us_listed_companies")
        .update({
          market_cap,
          market_cap_updated_at: now,
          updated_at: now,
        })
        .eq("ticker", ticker);
      if (!upErr) updated += 1;
    }

    await sleep(400);
  }

  return updated;
}

/**
 * 1) SEC exchange ticker master upsert
 * 2) Rotating market-cap enrichment (Yahoo batches)
 */
export async function syncUsListedCompanies(
  admin: SupabaseClient,
  opts?: {
    marketCapBatchSize?: number;
    skipMarketCap?: boolean;
    newswireBatchSize?: number;
    skipNewswire?: boolean;
  }
): Promise<UsListedSyncResult> {
  const started = Date.now();
  const marketCapBatchSize = opts?.marketCapBatchSize ?? DEFAULT_MARKET_CAP_BATCH;
  const newswireBatchSize = opts?.newswireBatchSize ?? DEFAULT_NEWSWIRE_BATCH;

  try {
    const [sec, trader] = await Promise.all([
      fetchSecExchangeTickers(),
      fetchNasdaqTraderExchanges().catch(() => new Map()),
    ]);
    const now = new Date().toISOString();
    const rows = sec.map((r) => ({
      ticker: r.ticker,
      name: r.name,
      cik: r.cik,
      exchange: trader.get(r.ticker) ?? r.exchange,
      updated_at: now,
    }));

    const upserted = await upsertCompanies(admin, rows);

    let marketCapUpdated = 0;
    if (!opts?.skipMarketCap) {
      marketCapUpdated = await refreshMarketCaps(admin, marketCapBatchSize);
    }

    let newswire: NewswireSyncResult | undefined;
    if (!opts?.skipNewswire) {
      newswire = await refreshPrimaryNewswires(admin, newswireBatchSize);
    }

    return {
      ok: true,
      secFetched: sec.length,
      upserted,
      marketCapUpdated,
      marketCapBatchSize,
      newswire,
      durationMs: Date.now() - started,
    };
  } catch (e) {
    return {
      ok: false,
      secFetched: 0,
      upserted: 0,
      marketCapUpdated: 0,
      marketCapBatchSize,
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - started,
    };
  }
}
