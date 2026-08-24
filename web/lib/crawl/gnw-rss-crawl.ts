/**
 * GlobeNewswire public RSS → Groq GPT JSON → Supabase `wire_news`.
 * Used by `npm run crawl:gnw` and `/api/cron/gnw-rss`.
 *
 * Stores headline + teaser + our Korean summary. Does not scrape full article bodies.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchGnwRssFeeds, type GnwRssItem } from "@/lib/gnw/rss";
import {
  capBucket,
  isActiveListed,
  normalizeCik,
  parseGnwCiks,
  parseGnwStockTags,
} from "@/lib/gnw/tickers";
import { analyzeWireTeaser } from "@/lib/llm/analyze-wire";
import { isGroqConfigured } from "@/lib/groq/client";
import type { GeminiAnalysisResult } from "@/lib/types";

const SOURCE = "globenewswire";

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

function fallbackAnalysis(error: string): GeminiAnalysisResult {
  return {
    title: "AI 분석 실패",
    summary_lines: ["요약 호출에 실패했습니다.", error.slice(0, 200), "원문 링크로 확인해 주세요."],
    sentiment: "neutral",
    score: 0,
  };
}

async function existingIds(client: SupabaseClient, ids: string[]): Promise<Set<string>> {
  const seen = new Set<string>();
  if (ids.length === 0) return seen;
  const chunkSize = 80;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await client
      .from("wire_news")
      .select("external_id")
      .eq("source", SOURCE)
      .in("external_id", chunk);
    if (error) throw new Error(`wire_news lookup: ${error.message}`);
    for (const row of data ?? []) {
      if (row.external_id) seen.add(String(row.external_id));
    }
  }
  return seen;
}

function indexListed(rows: ListedRow[]): {
  byTicker: Map<string, ListedRow>;
  byCik: Map<string, ListedRow>;
} {
  const byTicker = new Map<string, ListedRow>();
  const byCik = new Map<string, ListedRow>();
  for (const row of rows) {
    if (row.ticker) byTicker.set(String(row.ticker).toUpperCase(), row);
    const cik = normalizeCik(row.cik ?? "");
    if (cik && !byCik.has(cik)) byCik.set(cik, row);
  }
  return { byTicker, byCik };
}

async function listedLookup(
  client: SupabaseClient,
  tickers: string[],
  ciks: string[]
): Promise<{ byTicker: Map<string, ListedRow>; byCik: Map<string, ListedRow> }> {
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
  return indexListed(rows);
}

function pickListed(
  tickers: string[],
  ciks: string[],
  byTicker: Map<string, ListedRow>,
  byCik: Map<string, ListedRow>
): { ticker: string; row: ListedRow } | null {
  for (const ticker of tickers) {
    const row = byTicker.get(ticker);
    if (row && isActiveListed(row)) return { ticker: row.ticker, row };
  }
  for (const cik of ciks) {
    const row = byCik.get(cik);
    if (row && isActiveListed(row)) return { ticker: row.ticker, row };
  }
  return null;
}

export async function runGnwRssCrawl(supabase?: SupabaseClient): Promise<GnwCrawlResult> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const service = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!isGroqConfigured()) {
    return { ok: false, inserted: 0, scanned: 0, skipped: 0, message: "GROQ_API_KEY is not configured" };
  }

  const client =
    supabase ??
    createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

  const items = await fetchGnwRssFeeds();
  const already = await existingIds(
    client,
    items.map((i) => i.id)
  );

  const pending: Array<{ item: GnwRssItem; tickers: string[]; ciks: string[] }> = [];
  const allTickers = new Set<string>();
  const allCiks = new Set<string>();
  for (const item of items) {
    if (already.has(item.id)) continue;
    const blob = [item.title, item.teaser, ...item.stockTags];
    const tickers = parseGnwStockTags([...item.stockTags, item.title, item.teaser]);
    const ciks = [
      ...item.ciks.map((c) => normalizeCik(c)).filter((c): c is string => Boolean(c)),
      ...parseGnwCiks(blob),
    ].filter((c, i, arr) => arr.indexOf(c) === i);
    if (tickers.length === 0 && ciks.length === 0) continue;
    pending.push({ item, tickers, ciks });
    for (const t of tickers) allTickers.add(t);
    for (const c of ciks) allCiks.add(c);
  }

  const { byTicker, byCik } = await listedLookup(client, [...allTickers], [...allCiks]);
  const max = Math.max(1, Number(process.env.CRAWL_GNW_MAX_ITEMS || 40) || 40);
  let inserted = 0;
  let skipped = items.length - pending.length;
  let insertFailures = 0;
  let analyzed = 0;

  for (let i = 0; i < pending.length; i++) {
    if (analyzed >= max) {
      skipped += pending.length - i;
      break;
    }
    const { item, tickers, ciks } = pending[i];
    const match = pickListed(tickers, ciks, byTicker, byCik);
    if (!match) {
      skipped += 1;
      continue;
    }
    analyzed += 1;

    const analysisResult = await analyzeWireTeaser({
      title: item.title,
      teaser: item.teaser,
      ticker: match.ticker,
    });
    const analysis = analysisResult.ok ? analysisResult.data : fallbackAnalysis(analysisResult.error);
    const model = analysisResult.ok ? analysisResult.model : null;

    const { error: insErr } = await client.from("wire_news").insert({
      source: SOURCE,
      external_id: item.id,
      url: item.url,
      title: analysis.title,
      teaser: item.teaser || null,
      summary: analysis.summary_lines.join("\n"),
      sentiment: analysis.sentiment,
      analysis_score: analysis.score,
      tickers,
      primary_ticker: match.ticker,
      company_name: match.row.name || item.companyName || null,
      published_at: parsePublishedAt(item.publishedAt),
      market_cap: match.row.market_cap,
      cap_bucket: capBucket(match.row.market_cap),
      language: item.language || "en",
      llm_model: model,
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
    console.log("inserted", match.ticker, analysis.title);
  }

  const message = `done, inserted ${inserted} (scanned ${items.length}, skipped ${skipped}, insertFailures ${insertFailures})`;
  console.log(message);

  if (insertFailures > 0 && inserted === 0) {
    return { ok: false, inserted: 0, scanned: items.length, skipped, message };
  }

  return { ok: true, inserted, scanned: items.length, skipped, message };
}
