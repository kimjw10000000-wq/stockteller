/**
 * GlobeNewswire public RSS → Supabase `wire_news` (headline + teaser, no Groq).
 * Used by `npm run crawl:gnw`, `npm run poll:gnw`, and `/api/cron/gnw-rss`.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchGnwRssFeeds, type GnwRssItem } from "@/lib/gnw/rss";
import {
  capBucket,
  isActiveIssuer,
  namesLikelyMatch,
  normalizeCik,
  parseGnwCiks,
  parseGnwStockTags,
} from "@/lib/gnw/tickers";

const SOURCE = "globenewswire";
const DEFAULT_MAX = 20;

export type GnwCrawlResult = {
  ok: boolean;
  inserted: number;
  scanned: number;
  skipped: number;
  message: string;
};

type ListedRow = {
  ticker: string;
  name: string | null;
  cik: string | null;
  market_cap: number | null;
  exchange: string | null;
  is_active: boolean | null;
};

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function parsePublishedAt(raw: string | null): string | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

function publishedMs(raw: string | null): number {
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

function escapeIlike(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

async function existingTeaserLengths(
  client: SupabaseClient,
  ids: string[]
): Promise<Map<string, number>> {
  const seen = new Map<string, number>();
  if (ids.length === 0) return seen;
  const chunkSize = 80;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await client
      .from("wire_news")
      .select("external_id,teaser")
      .eq("source", SOURCE)
      .in("external_id", chunk);
    if (error) throw new Error(`wire_news lookup: ${error.message}`);
    for (const row of data ?? []) {
      if (!row.external_id) continue;
      seen.set(String(row.external_id), String(row.teaser ?? "").length);
    }
  }
  return seen;
}

function indexListed(rows: ListedRow[]): {
  byTicker: Map<string, ListedRow>;
  byCik: Map<string, ListedRow>;
  byName: ListedRow[];
} {
  const byTicker = new Map<string, ListedRow>();
  const byCik = new Map<string, ListedRow>();
  for (const row of rows) {
    if (row.ticker) byTicker.set(String(row.ticker).toUpperCase(), row);
    const cik = normalizeCik(row.cik ?? "");
    if (cik && !byCik.has(cik)) byCik.set(cik, row);
  }
  return { byTicker, byCik, byName: rows };
}

async function listedLookup(
  client: SupabaseClient,
  tickers: string[],
  ciks: string[],
  names: string[]
): Promise<{ byTicker: Map<string, ListedRow>; byCik: Map<string, ListedRow>; byName: ListedRow[] }> {
  const rows: ListedRow[] = [];
  if (tickers.length > 0) {
    const { data, error } = await client
      .from("us_listed_companies")
      .select("ticker,name,cik,market_cap,exchange,is_active")
      .in("ticker", tickers);
    if (error) throw new Error(`us_listed_companies ticker lookup: ${error.message}`);
    rows.push(...((data ?? []) as ListedRow[]));
  }
  if (ciks.length > 0) {
    const cikKeys = [...new Set(ciks.flatMap((c) => [c, String(parseInt(c, 10))]))];
    const { data, error } = await client
      .from("us_listed_companies")
      .select("ticker,name,cik,market_cap,exchange,is_active")
      .in("cik", cikKeys);
    if (error) throw new Error(`us_listed_companies cik lookup: ${error.message}`);
    rows.push(...((data ?? []) as ListedRow[]));
  }
  const uniqueNames = [...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 3))].slice(0, 30);
  for (const name of uniqueNames) {
    const { data, error } = await client
      .from("us_listed_companies")
      .select("ticker,name,cik,market_cap,exchange,is_active")
      .ilike("name", `%${escapeIlike(name.slice(0, 80))}%`)
      .limit(8);
    if (error) throw new Error(`us_listed_companies name lookup: ${error.message}`);
    rows.push(...((data ?? []) as ListedRow[]));
  }
  return indexListed(rows);
}

function pickIssuer(
  tickers: string[],
  ciks: string[],
  companyName: string | null,
  byTicker: Map<string, ListedRow>,
  byCik: Map<string, ListedRow>,
  byName: ListedRow[]
): { ticker: string; row: ListedRow } | null {
  for (const ticker of tickers) {
    const row = byTicker.get(ticker);
    if (row && isActiveIssuer(row)) return { ticker: row.ticker, row };
  }
  for (const cik of ciks) {
    const row = byCik.get(cik);
    if (row && isActiveIssuer(row)) return { ticker: row.ticker, row };
  }
  if (companyName) {
    for (const row of byName) {
      if (!isActiveIssuer(row) || !row.name) continue;
      if (namesLikelyMatch(companyName, row.name)) return { ticker: row.ticker, row };
    }
  }
  return null;
}

export async function runGnwRssCrawl(supabase?: SupabaseClient): Promise<GnwCrawlResult> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const service = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const client =
    supabase ??
    createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

  const items = [...(await fetchGnwRssFeeds())].sort(
    (a, b) => publishedMs(b.publishedAt) - publishedMs(a.publishedAt)
  );
  const already = await existingTeaserLengths(
    client,
    items.map((i) => i.id)
  );

  const pending: Array<{ item: GnwRssItem; tickers: string[]; ciks: string[] }> = [];
  const refresh: GnwRssItem[] = [];
  const allTickers = new Set<string>();
  const allCiks = new Set<string>();
  const allNames = new Set<string>();
  for (const item of items) {
    const prevLen = already.get(item.id);
    if (prevLen != null) {
      if (item.teaser.length > prevLen) refresh.push(item);
      continue;
    }
    const blob = [item.title, item.teaser, ...item.stockTags];
    const tickers = parseGnwStockTags([...item.stockTags, item.title, item.teaser]);
    const ciks = [
      ...item.ciks.map((c) => normalizeCik(c)).filter((c): c is string => Boolean(c)),
      ...parseGnwCiks(blob),
    ].filter((c, i, arr) => arr.indexOf(c) === i);
    if (tickers.length === 0 && ciks.length === 0 && !item.companyName) continue;
    pending.push({ item, tickers, ciks });
    for (const t of tickers) allTickers.add(t);
    for (const c of ciks) allCiks.add(c);
    if (item.companyName) allNames.add(item.companyName);
  }

  const { byTicker, byCik, byName } = await listedLookup(
    client,
    [...allTickers],
    [...allCiks],
    [...allNames]
  );
  const max = Math.max(1, Number(process.env.CRAWL_GNW_MAX_ITEMS || DEFAULT_MAX) || DEFAULT_MAX);
  let inserted = 0;
  let skipped = items.length - pending.length;
  let insertFailures = 0;
  let kept = 0;

  for (let i = 0; i < pending.length; i++) {
    if (kept >= max) {
      skipped += pending.length - i;
      break;
    }
    const { item, tickers, ciks } = pending[i];
    const match = pickIssuer(tickers, ciks, item.companyName, byTicker, byCik, byName);
    if (!match) {
      skipped += 1;
      continue;
    }
    kept += 1;

    const teaser = item.teaser || "";
    const { error: insErr } = await client.from("wire_news").insert({
      source: SOURCE,
      external_id: item.id,
      url: item.url,
      title: item.title,
      teaser: teaser || null,
      summary: teaser || null,
      sentiment: null,
      analysis_score: null,
      tickers: tickers.length > 0 ? tickers : [match.ticker],
      primary_ticker: match.ticker,
      company_name: match.row.name || item.companyName || null,
      published_at: parsePublishedAt(item.publishedAt),
      market_cap: match.row.market_cap,
      cap_bucket: capBucket(match.row.market_cap),
      language: item.language || "en",
      llm_model: null,
      affiliation: "news",
      newswire: "GlobeNewswire",
      form_type: null,
      accession: null,
    });

    if (insErr) {
      if (/duplicate|unique/i.test(insErr.message)) {
        skipped += 1;
        continue;
      }
      if (/could not find the table|schema cache|does not exist/i.test(insErr.message)) {
        return {
          ok: false,
          inserted,
          scanned: items.length,
          skipped,
          message: `wire_news table missing: ${insErr.message}. Run web/supabase/migrations/20260824_wire_news.sql`,
        };
      }
      console.warn("wire_news insert failed", item.id, insErr.message);
      insertFailures += 1;
      continue;
    }

    inserted += 1;
    console.log("inserted", match.ticker, item.title);
  }

  let updated = 0;
  for (const item of refresh) {
    const teaser = item.teaser || "";
    const { error } = await client
      .from("wire_news")
      .update({ teaser: teaser || null, summary: teaser || null })
      .eq("source", SOURCE)
      .eq("external_id", item.id);
    if (error) {
      console.warn("wire_news teaser update failed", item.id, error.message);
      continue;
    }
    updated += 1;
  }

  const message = `done, inserted ${inserted}, updated ${updated} (scanned ${items.length}, skipped ${skipped}, insertFailures ${insertFailures})`;
  console.log(message);

  if (insertFailures > 0 && inserted === 0) {
    return { ok: false, inserted: 0, scanned: items.length, skipped, message };
  }

  return { ok: true, inserted, scanned: items.length, skipped, message };
}
