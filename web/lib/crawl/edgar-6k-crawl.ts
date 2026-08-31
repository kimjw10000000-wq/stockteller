/**
 * SEC current 6-K Atom → Exhibit 99.1 required → Groq → wire_news as news and/or sec.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { groqModel } from "@/lib/groq/client";
import { analyzeFilingText } from "@/lib/llm/analyze-disclosure";
import { capBucket, isActiveIssuer, normalizeCik } from "@/lib/gnw/tickers";
import {
  archiveFileUrl,
  archiveIndexUrl,
  fetchFilingPlainText,
  listFilingDocumentNames,
  pickExhibit99_1Names,
  pickPrimaryDocumentName,
} from "@/lib/sec/filing-documents";
import { classifyExhibit99Dateline } from "@/lib/sec/newswire-dateline";
import { loadWorldCityNames } from "@/lib/sec/world-cities";
import { secFetch } from "@/lib/sec/edgar-client";
import type { GeminiAnalysisResult } from "@/lib/types";

const SOURCE = "edgar-6k";
const ATOM =
  "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=6-k&count=40&output=atom";
const DEFAULT_MAX = 8;

export type SixKCrawlResult = {
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
  is_active: boolean | null;
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

function parseAtom(xml: string) {
  const entries: Array<{
    title: string;
    idHref: string;
    updated: string;
    summary: string;
    link: string;
  }> = [];
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

function companyFromTitle(title: string): string | null {
  const m = /^6-K(?:\/A)?\s*[-–]\s*(.+?)\s*\(\d{6,10}\)/i.exec(title.trim());
  return m?.[1]?.trim() || null;
}

function formFromTitle(title: string): "6-K" | "6-K/A" {
  return /^6-K\/A/i.test(title.trim()) ? "6-K/A" : "6-K";
}

function publishedIso(updated: string): string | null {
  const t = Date.parse(updated);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

async function fetchSecAtom(ua: string, attempts = 3): Promise<string> {
  let lastStatus = 0;
  let lastBody = "";
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1500 * i));
    const res = await secFetch(ATOM, {
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

async function summarize(raw: string, kind: "news" | "sec"): Promise<GeminiAnalysisResult> {
  const result = await analyzeFilingText(raw, kind);
  if (result.ok) return result.data;
  return (
    result.data ?? {
      title: "AI 분석 실패",
      summary_lines: ["요약 호출에 실패했습니다.", result.error.slice(0, 200), "원문 링크만 저장합니다."],
      sentiment: "neutral",
      score: 0,
    }
  );
}

type InsertCard = {
  affiliation: "news" | "sec";
  externalId: string;
  url: string;
  title: string;
  summary: string;
  teaser: string;
  sentiment: string;
  score: number;
  newswire: string | null;
  llmModel: string | null;
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
      sentiment: card.sentiment,
      analysis_score: card.score,
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

export async function runEdgar6kCrawl(supabase?: SupabaseClient): Promise<SixKCrawlResult> {
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

  const xml = await fetchSecAtom(ua);
  const entries = parseAtom(xml);
  const max = Math.max(1, Number(process.env.CRAWL_6K_MAX_ITEMS || DEFAULT_MAX) || DEFAULT_MAX);

  const parsed = entries
    .map((e) => {
      const accession = accessionFromText(e.link) || accessionFromText(e.idHref) || accessionFromText(e.title);
      const cik = cikFromEntry(e.title, e.link, e.idHref);
      return accession && cik ? { e, accession, cik, company: companyFromTitle(e.title), form: formFromTitle(e.title) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

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
    if (done.has(row.accession)) {
      skipped += 1;
      continue;
    }
    const listed = listedMap.get(row.cik);
    if (!listed) {
      skipped += 1;
      continue;
    }

    const cikNumeric = Number.parseInt(row.cik, 10);
    const names = await listFilingDocumentNames(cikNumeric, row.accession);
    const exhibits = pickExhibit99_1Names(names);
    if (exhibits.length === 0) {
      console.log("[edgar-6k] skip (no Exhibit 99.1)", row.accession);
      skipped += 1;
      continue;
    }

    const exhibitName = exhibits[0]!;
    const primaryName = pickPrimaryDocumentName(names, exhibits);
    const exhibitUrl = archiveFileUrl(cikNumeric, row.accession, exhibitName);
    const primaryUrl = primaryName
      ? archiveFileUrl(cikNumeric, row.accession, primaryName)
      : archiveIndexUrl(cikNumeric, row.accession);

    const exhibitText = await fetchFilingPlainText(exhibitUrl);
    if (!exhibitText) {
      skipped += 1;
      continue;
    }
    processed += 1;

    const sameFile = !primaryName || primaryName.toLowerCase() === exhibitName.toLowerCase();
    const coverText = sameFile ? "" : (await fetchFilingPlainText(primaryUrl)) || "";
    const classified = classifyExhibit99Dateline(exhibitText, cities);
    const publishedAt = publishedIso(row.e.updated);
    const model = groqModel();

    const cards: InsertCard[] = [];

    if (classified.isNewswire) {
      const news = await summarize(exhibitText, "news");
      cards.push({
        affiliation: "news",
        externalId: `${row.accession}:news`,
        url: exhibitUrl,
        title: news.title,
        summary: news.summary_lines.join("\n"),
        teaser: news.summary_lines[0] ?? "",
        sentiment: news.sentiment,
        score: news.score,
        newswire: classified.newswire,
        llmModel: model,
      });
      const secRaw = coverText.trim() || row.e.summary || row.e.title;
      if (secRaw.trim()) {
        const sec = await summarize(secRaw, "sec");
        cards.push({
          affiliation: "sec",
          externalId: `${row.accession}:sec`,
          url: primaryUrl,
          title: sec.title,
          summary: sec.summary_lines.join("\n"),
          teaser: sec.summary_lines[0] ?? "",
          sentiment: sec.sentiment,
          score: sec.score,
          newswire: null,
          llmModel: model,
        });
      }
    } else {
      const combined = [coverText.trim(), exhibitText].filter(Boolean).join("\n\n");
      const sec = await summarize(combined, "sec");
      cards.push({
        affiliation: "sec",
        externalId: `${row.accession}:sec`,
        url: primaryUrl,
        title: sec.title,
        summary: sec.summary_lines.join("\n"),
        teaser: sec.summary_lines[0] ?? "",
        sentiment: sec.sentiment,
        score: sec.score,
        newswire: null,
        llmModel: model,
      });
    }

    inserted += await insertCards(client, {
      accession: row.accession,
      formType: row.form,
      listed,
      publishedAt,
      cards,
      llmModel: model,
    });
    console.log("[edgar-6k]", listed.ticker, row.accession, classified.isNewswire ? "news+sec" : "sec");
  }

  const message = `done, inserted ${inserted} (scanned ${entries.length}, processed ${processed}, skipped ${skipped})`;
  console.log(message);
  if (entries.length === 0) {
    return { ok: false, inserted: 0, scanned: 0, skipped, message: "SEC 6-K atom returned 0 entries" };
  }
  return { ok: true, inserted, scanned: entries.length, skipped, message };
}
