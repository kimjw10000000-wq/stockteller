/**
 * SEC current/company 6-K → Exhibit 99.1 containing "press release" → Groq → wire_news as News.
 * GlobeNewswire RSS stays News. 6-K without that dateline is skipped (not stored as SEC).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { groqModel } from "@/lib/groq/client";
import { analyzeFilingText } from "@/lib/llm/analyze-disclosure";
import { capBucket, isActiveIssuer, normalizeCik, normalizeTicker } from "@/lib/gnw/tickers";
import {
  archiveFileUrl,
  fetchFilingPlainText,
  listFilingDocumentNames,
  pickExhibit99_1Names,
} from "@/lib/sec/filing-documents";
import { classifyExhibit99Dateline } from "@/lib/sec/newswire-dateline";
import { detectListedNewswire, withNewswireAttribution } from "@/lib/sec/listed-newswires";
import { loadWorldCityNames } from "@/lib/sec/world-cities";
import { resolveTickerMeta, secFetch, sleep } from "@/lib/sec/edgar-client";
import type { GeminiAnalysisResult } from "@/lib/types";

const SOURCE = "edgar-6k";
const CURRENT_ATOM =
  "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=6-k&count=40&output=atom";
const DEFAULT_MAX = 8;
const COMPANY_ATOM_COUNT = 10;

export type SixKCrawlOptions = {
  tickers?: string[];
  latestPerTicker?: number;
};

export type SixKCrawlResult = {
  ok: boolean;
  inserted: number;
  scanned: number;
  skipped: number;
  tickers?: string[];
  message: string;
};

type ListedRow = {
  ticker: string;
  name: string | null;
  cik: string | null;
  market_cap: number | null;
  is_active: boolean | null;
};

type AtomEntry = {
  title: string;
  idHref: string;
  updated: string;
  summary: string;
  link: string;
};

type ParsedFiling = {
  e: AtomEntry;
  accession: string;
  cik: string;
  form: "6-K" | "6-K/A";
};

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function stripHtml(html: string) {
  return String(html)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchAll(regex: RegExp, text: string): RegExpExecArray[] {
  const out: RegExpExecArray[] = [];
  const r = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = r.exec(text)) !== null) out.push(m);
  return out;
}

function parseAtom(xml: string): AtomEntry[] {
  const entries: AtomEntry[] = [];
  for (const m of matchAll(/<entry>([\s\S]*?)<\/entry>/g, xml)) {
    const chunk = m[1];
    const title = (/<title(?:[^>]*)>([\s\S]*?)<\/title>/i.exec(chunk) || [])[1];
    const id = (/<id[^>]*>([\s\S]*?)<\/id>/i.exec(chunk) || [])[1];
    const updated = (/<updated>([^<]+)<\/updated>/i.exec(chunk) || [])[1];
    const summary = (/<summary(?:[^>]*)>([\s\S]*?)<\/summary>/i.exec(chunk) || [])[1];
    const link =
      (/<link[^>]+href="([^"]+)"[^>]*\/?>/i.exec(chunk) || [])[1] ||
      (/<link[^>]+href='([^']+)'[^>]*\/?>/i.exec(chunk) || [])[1];
    if (!title) continue;
    entries.push({
      title: stripHtml(title),
      idHref: id ? stripHtml(id) : "",
      updated: updated?.trim() ?? "",
      summary: summary ? stripHtml(summary) : "",
      link: link?.trim() ?? "",
    });
  }
  return entries;
}

function accessionFromText(t: string) {
  const m = /(\d{10}-\d{2}-\d{6})/.exec(t || "");
  return m ? m[1] : null;
}

function cikFromEntry(title: string, link: string, idHref: string): string | null {
  const fromUrl = /\/data\/(\d+)\//.exec(`${link} ${idHref}`);
  if (fromUrl) return normalizeCik(fromUrl[1]);
  const fromTitle = /\((\d{6,10})\)/.exec(title);
  return fromTitle ? normalizeCik(fromTitle[1]) : null;
}

function formFromTitle(title: string): "6-K" | "6-K/A" {
  return /^6-K\/A/i.test(title.trim()) ? "6-K/A" : "6-K";
}

function publishedIso(updated: string): string | null {
  const t = Date.parse(updated);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function parseFilings(entries: AtomEntry[]): ParsedFiling[] {
  return entries
    .map((e) => {
      const accession = accessionFromText(e.link) || accessionFromText(e.idHref) || accessionFromText(e.title);
      const cik = cikFromEntry(e.title, e.link, e.idHref);
      return accession && cik ? { e, accession, cik, form: formFromTitle(e.title) } : null;
    })
    .filter((x): x is ParsedFiling => Boolean(x));
}

function companyAtomUrl(cik: string) {
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(
    cik
  )}&type=6-K&owner=include&count=${COMPANY_ATOM_COUNT}&output=atom`;
}

async function fetchSecAtom(url: string, ua: string, attempts = 3): Promise<string> {
  let lastStatus = 0;
  let lastBody = "";
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1500 * i));
    const res = await secFetch(url, {
      headers: {
        "User-Agent": ua,
        Accept: "application/atom+xml,application/xml,text/xml,*/*",
        "Accept-Encoding": "identity",
      },
    });
    if (res.ok) return res.text();
    lastStatus = res.status;
    lastBody = await res.text().catch(() => "");
    if (res.status !== 403 && res.status !== 429 && res.status < 500) break;
  }
  throw new Error(`SEC 6-K atom fetch failed ${lastStatus}: ${lastBody.slice(0, 300)}`);
}

async function lookupListedByCiks(client: SupabaseClient, ciks: string[]): Promise<Map<string, ListedRow>> {
  const map = new Map<string, ListedRow>();
  const unique = [...new Set(ciks.filter(Boolean))];
  if (unique.length === 0) return map;
  const keys = [...new Set(unique.flatMap((c) => [c, String(parseInt(c, 10))]))];
  const { data, error } = await client
    .from("us_listed_companies")
    .select("ticker,name,cik,market_cap,is_active")
    .in("cik", keys);
  if (error) {
    console.error("[edgar-6k] listed lookup", error.message);
    return map;
  }
  for (const row of (data ?? []) as ListedRow[]) {
    const cik = normalizeCik(row.cik ?? "");
    if (cik && isActiveIssuer(row)) map.set(cik, row);
  }
  return map;
}

async function lookupListedByTickers(
  client: SupabaseClient,
  tickers: string[]
): Promise<Map<string, ListedRow>> {
  const map = new Map<string, ListedRow>();
  const keys = [...new Set(tickers.map((t) => normalizeTicker(t)).filter(Boolean))];
  if (keys.length === 0) return map;
  const { data, error } = await client
    .from("us_listed_companies")
    .select("ticker,name,cik,market_cap,is_active")
    .in("ticker", keys);
  if (error) {
    console.error("[edgar-6k] ticker lookup", error.message);
    return map;
  }
  for (const row of (data ?? []) as ListedRow[]) {
    if (!isActiveIssuer(row)) continue;
    map.set(normalizeTicker(row.ticker), row);
  }
  return map;
}

async function cikForListed(listed: ListedRow): Promise<string | null> {
  const fromRow = normalizeCik(listed.cik ?? "");
  if (fromRow) return fromRow;
  const meta = await resolveTickerMeta(listed.ticker);
  return meta?.cikPadded ?? null;
}

async function alreadyAccessions(client: SupabaseClient, accessions: string[]): Promise<Set<string>> {
  const seen = new Set<string>();
  if (accessions.length === 0) return seen;
  const { data, error } = await client
    .from("wire_news")
    .select("accession,external_id")
    .eq("source", SOURCE)
    .in("accession", accessions);
  if (error) {
    console.warn("[edgar-6k] existing lookup", error.message);
    return seen;
  }
  for (const row of data ?? []) {
    if (row.accession) seen.add(String(row.accession));
  }
  return seen;
}

async function summarize(raw: string, kind: "news" | "sec"): Promise<GeminiAnalysisResult | null> {
  const result = await analyzeFilingText(raw, kind);
  if (!result.ok) {
    console.warn("[edgar-6k] groq failed", result.error.slice(0, 240));
    return null;
  }
  return { ...result.data, sentiment: "neutral", score: 0 };
}

type InsertCard = {
  affiliation: "news" | "sec";
  externalId: string;
  url: string;
  title: string;
  summary: string;
  teaser: string;
  newswire: string | null;
};

async function insertCards(
  client: SupabaseClient,
  params: {
    accession: string;
    formType: string;
    listed: ListedRow;
    publishedAt: string | null;
    cards: InsertCard[];
    llmModel: string | null;
  }
): Promise<number> {
  let n = 0;
  for (const card of params.cards) {
    const { error } = await client.from("wire_news").insert({
      source: SOURCE,
      external_id: card.externalId,
      url: card.url,
      title: card.title,
      teaser: card.teaser,
      summary: card.summary,
      sentiment: "neutral",
      analysis_score: 0,
      tickers: [params.listed.ticker],
      primary_ticker: params.listed.ticker,
      company_name: params.listed.name,
      published_at: params.publishedAt,
      market_cap: params.listed.market_cap,
      cap_bucket: capBucket(params.listed.market_cap),
      language: "ko",
      llm_model: params.llmModel,
      affiliation: card.affiliation,
      newswire: card.newswire,
      form_type: params.formType,
      accession: params.accession,
    });
    if (error) {
      if (/duplicate|unique/i.test(error.message)) continue;
      console.warn("[edgar-6k] insert failed", card.externalId, error.message);
      continue;
    }
    n += 1;
  }
  return n;
}

type IngestKind = "exists" | "no-exhibit" | "no-wire" | "skip" | "done";

async function ingestOne(
  client: SupabaseClient,
  row: ParsedFiling,
  listed: ListedRow,
  cities: Set<string>,
  done: Set<string>
): Promise<{ kind: IngestKind; inserted: number }> {
  if (done.has(row.accession)) return { kind: "exists", inserted: 0 };

  const cikNumeric = Number.parseInt(row.cik, 10);
  const names = await listFilingDocumentNames(cikNumeric, row.accession);
  const exhibits = pickExhibit99_1Names(names);
  if (exhibits.length === 0) {
    console.log("[edgar-6k] skip (no Exhibit 99.1)", listed.ticker, row.accession);
    return { kind: "no-exhibit", inserted: 0 };
  }

  const exhibitName = exhibits[0]!;
  const exhibitUrl = archiveFileUrl(cikNumeric, row.accession, exhibitName);
  const exhibitText = await fetchFilingPlainText(exhibitUrl);
  if (!exhibitText) return { kind: "skip", inserted: 0 };

  const classified = classifyExhibit99Dateline(exhibitText, cities);
  if (!classified.isNewswire) {
    console.log("[edgar-6k] skip (no press release in 99.1)", listed.ticker, row.accession);
    return { kind: "no-wire", inserted: 0 };
  }

  const news = await summarize(exhibitText, "news");
  if (!news) return { kind: "skip", inserted: 0 };

  const wire = detectListedNewswire(exhibitText) || classified.newswire;
  const summary = withNewswireAttribution(news.summary_lines.join("\n"), wire);

  const publishedAt = publishedIso(row.e.updated);
  const inserted = await insertCards(client, {
    accession: row.accession,
    formType: row.form,
    listed,
    publishedAt,
    cards: [
      {
        affiliation: "news",
        externalId: `${row.accession}:news`,
        url: exhibitUrl,
        title: news.title,
        summary,
        teaser: news.summary_lines[0] ?? "",
        newswire: wire,
      },
    ],
    llmModel: groqModel(),
  });
  done.add(row.accession);
  console.log("[edgar-6k]", listed.ticker, row.accession, "news", wire);
  return { kind: "done", inserted };
}

async function runTickerCrawl(
  client: SupabaseClient,
  ua: string,
  tickers: string[],
  latestPerTicker: number
): Promise<SixKCrawlResult> {
  const wanted = [...new Set(tickers.map((t) => normalizeTicker(t)).filter(Boolean))];
  const listedMap = await lookupListedByTickers(client, wanted);
  const cities = await loadWorldCityNames(client);
  const done = new Set<string>();

  let inserted = 0;
  let skipped = 0;
  let scanned = 0;

  for (let i = 0; i < wanted.length; i++) {
    const ticker = wanted[i]!;
    if (i > 0) await sleep(8_000);
    const listed = listedMap.get(ticker);
    if (!listed) {
      console.warn("[edgar-6k] not in us_listed_companies", ticker);
      skipped += 1;
      continue;
    }
    const cik = await cikForListed(listed);
    if (!cik) {
      console.warn("[edgar-6k] no CIK", ticker);
      skipped += 1;
      continue;
    }

    const xml = await fetchSecAtom(companyAtomUrl(cik), ua);
    const parsed = parseFilings(parseAtom(xml));
    scanned += parsed.length;

    const existing = await alreadyAccessions(
      client,
      parsed.map((p) => p.accession)
    );
    for (const acc of existing) done.add(acc);

    let taken = 0;
    for (const row of parsed) {
      if (taken >= latestPerTicker) break;
      const result = await ingestOne(client, { ...row, cik }, listed, cities, done);
      if (result.kind === "no-exhibit" || result.kind === "no-wire" || result.kind === "skip") {
        skipped += 1;
        continue;
      }
      taken += 1;
      inserted += result.inserted;
      if (result.kind === "exists") skipped += 1;
    }
    if (taken === 0) {
      console.warn("[edgar-6k] no 6-K Exhibit 99.1 with press release", ticker);
    }
  }

  const message = `done, inserted ${inserted} (tickers ${wanted.join(",")}, scanned ${scanned}, skipped ${skipped})`;
  console.log(message);
  return { ok: true, inserted, scanned, skipped, tickers: wanted, message };
}

export async function runEdgar6kCrawl(
  supabase?: SupabaseClient,
  options?: SixKCrawlOptions
): Promise<SixKCrawlResult> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const service = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const ua =
    process.env.SEC_USER_AGENT?.trim() ||
    "WhyUpSixKCrawler/1.0 (+https://whyup.net; contact@whyup.net)";

  const client =
    supabase ??
    createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

  const tickers = (options?.tickers ?? [])
    .map((t) => normalizeTicker(t))
    .filter(Boolean);
  if (tickers.length) {
    const latest = Math.max(1, options?.latestPerTicker ?? 1);
    return runTickerCrawl(client, ua, tickers, latest);
  }

  const xml = await fetchSecAtom(CURRENT_ATOM, ua);
  const entries = parseAtom(xml);
  const max = Math.max(1, Number(process.env.CRAWL_6K_MAX_ITEMS || DEFAULT_MAX) || DEFAULT_MAX);
  const parsed = parseFilings(entries);
  const listedMap = await lookupListedByCiks(
    client,
    parsed.map((p) => p.cik)
  );
  const done = await alreadyAccessions(
    client,
    parsed.map((p) => p.accession)
  );
  const cities = await loadWorldCityNames(client);

  let inserted = 0;
  let skipped = 0;
  let processed = 0;

  for (const row of parsed) {
    if (processed >= max) break;
    const listed = listedMap.get(row.cik);
    if (!listed) {
      skipped += 1;
      continue;
    }
    const result = await ingestOne(client, row, listed, cities, done);
    if (result.kind === "exists" || result.kind === "no-exhibit" || result.kind === "no-wire" || result.kind === "skip") {
      skipped += 1;
      continue;
    }
    processed += 1;
    inserted += result.inserted;
  }

  const message = `done, inserted ${inserted} (scanned ${entries.length}, processed ${processed}, skipped ${skipped})`;
  console.log(message);
  if (entries.length === 0) {
    return { ok: false, inserted: 0, scanned: 0, skipped, message: "SEC 6-K atom returned 0 entries" };
  }
  return { ok: true, inserted, scanned: entries.length, skipped, message };
}
