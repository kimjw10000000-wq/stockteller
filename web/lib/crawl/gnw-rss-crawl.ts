/**
 * GlobeNewswire public RSS → Groq Korean literal translation → wire_news.
 * Stores RSS English in original_* and Korean in title/teaser/summary.
 * Used by `npm run crawl:gnw`, `npm run poll:gnw`, and `/api/cron/gnw-rss`.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { groqModel, isGroqConfigured } from "@/lib/groq/client";
import { fetchGnwRssFeeds, type GnwRssItem } from "@/lib/gnw/rss";
import { translatePressRelease } from "@/lib/llm/analyze-disclosure";
import { withNewswireAttribution } from "@/lib/sec/listed-newswires";
import {
  capBucket,
  isActiveIssuer,
  namesLikelyMatch,
  normalizeCik,
  parseGnwCiks,
  parseGnwStockTags,
} from "@/lib/gnw/tickers";

const SOURCE = "globenewswire";
const DEFAULT_MAX = 8;

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
    const full = await client
      .from("wire_news")
      .select("external_id,teaser,original_teaser")
      .eq("source", SOURCE)
      .in("external_id", chunk);
    const { data, error } =
      full.error && /original_teaser/i.test(full.error.message)
        ? await client
            .from("wire_news")
            .select("external_id,teaser")
            .eq("source", SOURCE)
            .in("external_id", chunk)
        : full;
    if (error) throw new Error(`wire_news lookup: ${error.message}`);
    for (const row of data ?? []) {
      if (!row.external_id) continue;
      const original = "original_teaser" in row ? String(row.original_teaser ?? "") : "";
      seen.set(String(row.external_id), (original || String(row.teaser ?? "")).length);
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

type GnwKoCopy = {
  title: string;
  teaser: string;
  summary: string;
  language: string;
  llmModel: string | null;
};

async function translateGnwCopy(title: string, teaser: string): Promise<GnwKoCopy | null> {
  if (!isGroqConfigured()) {
    return {
      title,
      teaser,
      summary: teaser,
      language: "en",
      llmModel: null,
    };
  }
  const result = await translatePressRelease({ title, teaser });
  if (!result.ok) {
    console.warn("gnw translate failed", result.error.slice(0, 240));
    return null;
  }
  const lines = result.data.summary_lines.filter(Boolean);
  const summary = withNewswireAttribution(lines.join("\n"), "GlobeNewswire");
  return {
    title: result.data.title,
    teaser: lines[0] ?? "",
    summary,
    language: "ko",
    llmModel: groqModel(),
  };
}

async function wireNewsHasOriginalColumns(client: SupabaseClient): Promise<boolean> {
  const { error } = await client.from("wire_news").select("original_title").limit(1);
  return !error;
}

function gnwRowPayload(
  item: GnwRssItem,
  match: { ticker: string; row: ListedRow },
  tickers: string[],
  originalTitle: string,
  originalTeaser: string,
  ko: GnwKoCopy,
  withOriginal: boolean
) {
  const row: Record<string, unknown> = {
    source: SOURCE,
    external_id: item.id,
    url: item.url,
    title: ko.title,
    teaser: ko.teaser || null,
    summary: ko.summary || null,
    sentiment: null,
    analysis_score: null,
    tickers: tickers.length > 0 ? tickers : [match.ticker],
    primary_ticker: match.ticker,
    company_name: match.row.name || item.companyName || null,
    published_at: parsePublishedAt(item.publishedAt),
    market_cap: match.row.market_cap,
    cap_bucket: capBucket(match.row.market_cap),
    language: ko.language,
    llm_model: ko.llmModel,
    affiliation: "news",
    newswire: "GlobeNewswire",
    form_type: null,
    accession: null,
  };
  if (withOriginal) {
    row.original_title = originalTitle;
    row.original_teaser = originalTeaser || null;
    row.original_summary = originalTeaser || null;
  }
  return row;
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

  const hasOriginal = await wireNewsHasOriginalColumns(client);
  if (!hasOriginal) {
    console.warn(
      "wire_news original_* missing — run web/supabase/migrations/20260902_wire_news_original.sql (English-only this cycle)"
    );
  }

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

    const originalTitle = item.title;
    const originalTeaser = item.teaser || "";
    const ko =
      hasOriginal && isGroqConfigured()
        ? await translateGnwCopy(originalTitle, originalTeaser)
        : {
            title: originalTitle,
            teaser: originalTeaser,
            summary: originalTeaser,
            language: item.language || "en",
            llmModel: null as string | null,
          };
    if (!ko) {
      skipped += 1;
      continue;
    }

    const { error: insErr } = await client
      .from("wire_news")
      .insert(gnwRowPayload(item, match, tickers, originalTitle, originalTeaser, ko, hasOriginal));

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
    console.log("inserted", match.ticker, ko.title);
  }

  let updated = 0;
  for (const item of refresh) {
    const originalTitle = item.title;
    const originalTeaser = item.teaser || "";
    const ko =
      hasOriginal && isGroqConfigured()
        ? await translateGnwCopy(originalTitle, originalTeaser)
        : {
            title: originalTitle,
            teaser: originalTeaser,
            summary: originalTeaser,
            language: item.language || "en",
            llmModel: null as string | null,
          };
    if (!ko) continue;
    const patch: Record<string, unknown> = {
      title: ko.title,
      teaser: ko.teaser || null,
      summary: ko.summary || null,
      language: ko.language,
      llm_model: ko.llmModel,
    };
    if (hasOriginal) {
      patch.original_title = originalTitle;
      patch.original_teaser = originalTeaser || null;
      patch.original_summary = originalTeaser || null;
    }
    const { error } = await client.from("wire_news").update(patch).eq("source", SOURCE).eq("external_id", item.id);
    if (error) {
      console.warn("wire_news teaser update failed", item.id, error.message);
      continue;
    }
    updated += 1;
  }

  if (hasOriginal && isGroqConfigured()) {
    const pendingKo = await client
      .from("wire_news")
      .select("id,external_id,title,teaser,summary,original_title,original_teaser")
      .eq("source", SOURCE)
      .is("llm_model", null)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(4);
    if (!pendingKo.error) {
      for (const row of pendingKo.data ?? []) {
        const originalTitle = String(row.original_title || row.title || "");
        const originalTeaser = String(row.original_teaser || row.teaser || row.summary || "");
        const ko = await translateGnwCopy(originalTitle, originalTeaser);
        if (!ko) continue;
        const patch: Record<string, unknown> = {
          title: ko.title,
          teaser: ko.teaser || null,
          summary: ko.summary || null,
          language: ko.language,
          llm_model: ko.llmModel,
          original_title: originalTitle,
          original_teaser: originalTeaser || null,
          original_summary: originalTeaser || null,
        };
        let { error } = await client.from("wire_news").update(patch).eq("id", row.id);
        if (error && /original_title|original_teaser|original_summary/i.test(error.message)) {
          delete patch.original_title;
          delete patch.original_teaser;
          delete patch.original_summary;
          const retry = await client.from("wire_news").update(patch).eq("id", row.id);
          error = retry.error;
        }
        if (!error) updated += 1;
      }
    }
  }

  const message = `done, inserted ${inserted}, updated ${updated} (scanned ${items.length}, skipped ${skipped}, insertFailures ${insertFailures})`;
  console.log(message);

  if (insertFailures > 0 && inserted === 0) {
    return { ok: false, inserted: 0, scanned: items.length, skipped, message };
  }

  return { ok: true, inserted, scanned: items.length, skipped, message };
}
