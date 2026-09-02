import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchMarketCaps } from "./market-cap";
import { fetchSecExchangeTickers } from "./sec-exchange-tickers";
import { fetchNasdaqTraderExchanges } from "./nasdaq-trader-exchanges";
import { classifyShareClass } from "./share-class";
import {
  parsePreviousTickers,
  planUsListedDiff,
  type DbListingRow,
  type ListingDiffPlan,
} from "./listing-diff";
import {
  DEFAULT_NEWSWIRE_BATCH,
  refreshPrimaryNewswires,
  type NewswireSyncResult,
} from "./sync-newswire";
import { sleep } from "@/lib/sec/edgar-client";

const UPSERT_CHUNK = 500;
const UPDATE_CHUNK = 200;
const PAGE = 1000;
const DEFAULT_MARKET_CAP_BATCH = 300;

export type UsListedSyncResult = {
  ok: boolean;
  secFetched: number;
  upserted: number;
  inserted: number;
  deactivated: number;
  tickerRenamed: number;
  exchangeUpdated: number;
  marketCapUpdated: number;
  marketCapBatchSize: number;
  newswire?: NewswireSyncResult;
  samples?: {
    inserted: string[];
    deactivated: string[];
    renamed: Array<{ from: string; to: string }>;
  };
  error?: string;
  durationMs: number;
};

type CompanyInsert = {
  ticker: string;
  name: string;
  cik: string;
  exchange: string;
  share_class: string;
  is_active: boolean;
  previous_tickers: string[];
  updated_at: string;
};

async function loadDbListings(admin: SupabaseClient): Promise<DbListingRow[]> {
  const rows: DbListingRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("us_listed_companies")
      .select("ticker,name,cik,exchange,is_active,previous_tickers")
      .range(from, from + PAGE - 1);
    if (error) {
      if (/is_active|previous_tickers/i.test(error.message)) {
        throw new Error(
          `${error.message} — run web/supabase/migrations/20260824_us_listed_active_ticker_history.sql`
        );
      }
      throw new Error(`us_listed_companies load: ${error.message}`);
    }
    const chunk = (data ?? []) as Array<{
      ticker: string;
      name: string;
      cik: string;
      exchange: string;
      is_active: boolean | null;
      previous_tickers: unknown;
    }>;
    for (const r of chunk) {
      rows.push({
        ticker: String(r.ticker).toUpperCase(),
        name: r.name,
        cik: String(r.cik ?? "").replace(/\D/g, "").padStart(10, "0"),
        exchange: String(r.exchange ?? "").toUpperCase(),
        is_active: r.is_active !== false,
        previous_tickers: parsePreviousTickers(r.previous_tickers),
      });
    }
    if (chunk.length < PAGE) break;
  }
  return rows;
}

async function insertCompanies(admin: SupabaseClient, rows: CompanyInsert[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await admin.from("us_listed_companies").upsert(chunk, {
      onConflict: "ticker",
    });
    if (error && /share_class/i.test(error.message)) {
      const stripped = chunk.map(
        ({ ticker, name, cik, exchange, is_active, previous_tickers, updated_at }) => ({
          ticker,
          name,
          cik,
          exchange,
          is_active,
          previous_tickers,
          updated_at,
        })
      );
      const retry = await admin.from("us_listed_companies").upsert(stripped, {
        onConflict: "ticker",
      });
      if (retry.error) throw new Error(`us_listed_companies insert: ${retry.error.message}`);
    } else if (error && /is_active|previous_tickers/i.test(error.message)) {
      throw new Error(
        `us_listed_companies insert: ${error.message} — run web/supabase/migrations/20260824_us_listed_active_ticker_history.sql`
      );
    } else if (error) {
      throw new Error(`us_listed_companies insert: ${error.message}`);
    }
    n += chunk.length;
  }
  return n;
}

async function refreshWireNewsIssuer(
  admin: SupabaseClient,
  params: {
    ticker: string;
    name: string;
    replaceTicker?: { from: string; to: string };
  }
): Promise<void> {
  const { data, error } = await admin
    .from("wire_news")
    .select("id,tickers")
    .eq("primary_ticker", params.ticker);
  if (error || !data?.length) return;
  const from = params.replaceTicker?.from.toUpperCase();
  const to = params.replaceTicker?.to;
  for (const row of data) {
    let tickers = Array.isArray(row.tickers) ? (row.tickers as unknown[]).map(String) : [params.ticker];
    if (from && to) {
      tickers = tickers.map((t) => (t.toUpperCase() === from ? to : t));
      if (!tickers.includes(to)) tickers = [to, ...tickers];
    }
    await admin
      .from("wire_news")
      .update({ company_name: params.name, tickers })
      .eq("id", row.id);
  }
}

async function applyListingPlan(
  admin: SupabaseClient,
  plan: ListingDiffPlan,
  now: string
): Promise<{
  inserted: number;
  deactivated: number;
  tickerRenamed: number;
  exchangeUpdated: number;
}> {
  let tickerRenamed = 0;
  for (const rename of plan.renames) {
    const { error } = await admin
      .from("us_listed_companies")
      .update({
        ticker: rename.to,
        name: rename.name,
        cik: rename.cik,
        exchange: rename.exchange,
        share_class: classifyShareClass({ ticker: rename.to, name: rename.name }),
        is_active: true,
        previous_tickers: rename.previous_tickers,
        updated_at: now,
      })
      .eq("ticker", rename.from);
    if (error) {
      console.warn("[us-listed-sync] ticker rename failed", rename.from, "→", rename.to, error.message);
      await insertCompanies(admin, [
        {
          ticker: rename.to,
          name: rename.name,
          cik: rename.cik,
          exchange: rename.exchange,
          share_class: classifyShareClass({ ticker: rename.to, name: rename.name }),
          is_active: true,
          previous_tickers: rename.previous_tickers,
          updated_at: now,
        },
      ]);
      await admin
        .from("us_listed_companies")
        .update({ exchange: "OTC", is_active: false, updated_at: now })
        .eq("ticker", rename.from);
      await admin
        .from("company_analysis_results")
        .update({ ticker: rename.to })
        .eq("ticker", rename.from);
      await admin
        .from("wire_news")
        .update({ primary_ticker: rename.to, company_name: rename.name })
        .eq("primary_ticker", rename.from);
      await refreshWireNewsIssuer(admin, {
        ticker: rename.to,
        name: rename.name,
        replaceTicker: { from: rename.from, to: rename.to },
      });
      tickerRenamed += 1;
      continue;
    }
    tickerRenamed += 1;
    await admin
      .from("company_analysis_results")
      .update({ ticker: rename.to })
      .eq("ticker", rename.from);
    await refreshWireNewsIssuer(admin, {
      ticker: rename.to,
      name: rename.name,
      replaceTicker: { from: rename.from, to: rename.to },
    });
  }

  const inserts: CompanyInsert[] = plan.inserts.map((r) => ({
    ticker: r.ticker,
    name: r.name,
    cik: r.cik,
    exchange: r.exchange,
    share_class: classifyShareClass({ ticker: r.ticker, name: r.name }),
    is_active: true,
    previous_tickers: [],
    updated_at: now,
  }));
  const inserted = await insertCompanies(admin, inserts);

  let exchangeUpdated = 0;
  for (let i = 0; i < plan.updates.length; i += UPDATE_CHUNK) {
    const chunk = plan.updates.slice(i, i + UPDATE_CHUNK);
    await Promise.all(
      chunk.map(async (row) => {
        const patch: Record<string, unknown> = {
          name: row.name,
          cik: row.cik,
          exchange: row.exchange,
          is_active: true,
          updated_at: now,
        };
        if (row.previous_tickers) patch.previous_tickers = row.previous_tickers;
        const { error } = await admin.from("us_listed_companies").update(patch).eq("ticker", row.ticker);
        if (!error) {
          exchangeUpdated += 1;
          await admin.from("wire_news").update({ company_name: row.name }).eq("primary_ticker", row.ticker);
        }
      })
    );
  }

  let deactivated = 0;
  for (let i = 0; i < plan.deactivates.length; i += UPDATE_CHUNK) {
    const tickers = plan.deactivates.slice(i, i + UPDATE_CHUNK);
    const { error, count } = await admin
      .from("us_listed_companies")
      .update({ exchange: "OTC", is_active: false, updated_at: now }, { count: "exact" })
      .in("ticker", tickers)
      .eq("is_active", true);
    if (error) throw new Error(`us_listed_companies deactivate: ${error.message}`);
    deactivated += count ?? tickers.length;
  }

  return { inserted, deactivated, tickerRenamed, exchangeUpdated };
}

async function refreshMarketCaps(
  admin: SupabaseClient,
  batchSize: number
): Promise<number> {
  const { data, error } = await admin
    .from("us_listed_companies")
    .select("ticker")
    .eq("is_active", true)
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
 * 1) SEC listed-master reconcile (insert / ticker rename / OTC+inactive / exchange)
 * 2) Rotating market-cap enrichment
 * 3) Rotating newswire enrichment
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
    const [sec, trader, db] = await Promise.all([
      fetchSecExchangeTickers({ listedOnly: true }),
      fetchNasdaqTraderExchanges().catch(() => new Map()),
      loadDbListings(admin),
    ]);
    const now = new Date().toISOString();
    const secRows = sec.map((r) => ({
      ...r,
      exchange: trader.get(r.ticker) ?? r.exchange,
    }));
    const plan = planUsListedDiff(secRows, db);
    const listing = await applyListingPlan(admin, plan, now);

    console.log(
      `[us-listed-sync] sec=${sec.length} inserted=${listing.inserted} deactivated=${listing.deactivated} renamed=${listing.tickerRenamed} updated=${listing.exchangeUpdated}`
    );

    const { error: adrErr } = await admin
      .from("us_listed_companies")
      .update({ share_class: "ADR" })
      .eq("issuer_type", "FOREIGN")
      .eq("is_active", true);
    if (adrErr) console.warn("[us-listed-sync] share_class ADR update skipped:", adrErr.message);

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
      upserted: listing.inserted + listing.exchangeUpdated + listing.tickerRenamed,
      inserted: listing.inserted,
      deactivated: listing.deactivated,
      tickerRenamed: listing.tickerRenamed,
      exchangeUpdated: listing.exchangeUpdated,
      marketCapUpdated,
      marketCapBatchSize,
      newswire,
      samples: {
        inserted: plan.inserts.slice(0, 12).map((r) => r.ticker),
        deactivated: plan.deactivates.slice(0, 12),
        renamed: plan.renames.slice(0, 12).map((r) => ({ from: r.from, to: r.to })),
      },
      durationMs: Date.now() - started,
    };
  } catch (e) {
    return {
      ok: false,
      secFetched: 0,
      upserted: 0,
      inserted: 0,
      deactivated: 0,
      tickerRenamed: 0,
      exchangeUpdated: 0,
      marketCapUpdated: 0,
      marketCapBatchSize,
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - started,
    };
  }
}
