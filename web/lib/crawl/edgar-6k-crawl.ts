/**
 * SEC current 8-K / 6-K → Exhibit 99.1 containing "press release" → Groq → wire_news as News.
 * GlobeNewswire RSS stays News. Filings without that exhibit/phrase are skipped (not stored as SEC).
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

const DEFAULT_MAX = 8;
const COMPANY_ATOM_COUNT = 10;

export type EdgarPressForm = "6-k" | "8-k";

export type SixKCrawlOptions = {
  tickers?: string[];
  latestPerTicker?: number;
  /** Omit or `"both"` = 8-K and 6-K in the same run. */
  form?: EdgarPressForm | "both";
  /** Process-lifetime accessions we already opened or rejected — skip SEC document fetches. */
  seenAccessions?: Set<string>;
  /** Max new filings to open per form in this run (cron default 8, VPS poll 1). */
  maxItems?: number;
};

export type SixKCrawlResult = {
  ok: boolean;
  inserted: number;
  scanned: number;
  skipped: number;
  form?: EdgarPressForm;
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

type FormType = "6-K" | "6-K/A" | "8-K" | "8-K/A";

type ParsedFiling = {
  e: AtomEntry;
  accession: string;
  cik: string;
  form: FormType;
};

function pressSource(form: EdgarPressForm): "edgar-6k" | "edgar-8k" {
  return form === "8-k" ? "edgar-8k" : "edgar-6k";
}

function resolveFamilies(form?: EdgarPressForm | "both"): EdgarPressForm[] {
  if (form === "8-k") return ["8-k"];
  if (form === "6-k") return ["6-k"];
  return ["8-k", "6-k"];
}

function preferListed(prev: ListedRow | undefined, next: ListedRow): ListedRow {
  if (!prev) return next;
  const capA = prev.market_cap ?? -1;
  const capB = next.market_cap ?? -1;
  if (capB !== capA) return capB > capA ? next : prev;
  return next.ticker.length < prev.ticker.length ? next : prev;
}

type QueuedFiling = ParsedFiling & { family: EdgarPressForm; source: "edgar-6k" | "edgar-8k" };

function currentAtomUrl(form: EdgarPressForm): string {
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=${form}&count=40&output=atom`;
}

function companyAtomUrl(cik: string, form: EdgarPressForm) {
  const type = form === "8-k" ? "8-K" : "6-K";
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(
    cik
  )}&type=${encodeURIComponent(type)}&owner=include&count=${COMPANY_ATOM_COUNT}&output=atom`;
}

function formFromTitle(title: string, family: EdgarPressForm): FormType {
  const t = title.trim();
  if (family === "8-k") return /^8-K\/A/i.test(t) ? "8-K/A" : "8-K";
  return /^6-K\/A/i.test(t) ? "6-K/A" : "6-K";
}

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

function publishedIso(updated: string): string | null {
  const t = Date.parse(updated);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function parseFilings(entries: AtomEntry[], family: EdgarPressForm): ParsedFiling[] {
  return entries
    .map((e) => {
      const accession = accessionFromText(e.link) || accessionFromText(e.idHref) || accessionFromText(e.title);
      const cik = cikFromEntry(e.title, e.link, e.idHref);
      return accession && cik ? { e, accession, cik, form: formFromTitle(e.title, family) } : null;
    })
    .filter((x): x is ParsedFiling => Boolean(x));
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
  throw new Error(`SEC atom fetch failed ${lastStatus}: ${lastBody.slice(0, 300)}`);
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
    if (cik && isActiveIssuer(row)) map.set(cik, preferListed(map.get(cik), row));
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
    .select("accession")
    .in("accession", accessions);
  if (error) {
    console.warn("[edgar-press] existing lookup", error.message);
    return seen;
  }
  for (const row of data ?? []) {
    if (row.accession) seen.add(String(row.accession));
  }
  return seen;
}

async function summarize(
  raw: string,
  kind: "news" | "sec",
  source: "edgar-6k" | "edgar-8k"
): Promise<GeminiAnalysisResult | null> {
  const result = await analyzeFilingText(raw, kind);
  if (!result.ok) {
    console.warn(`[${source}] groq failed`, result.error.slice(0, 240));
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
    source: "edgar-6k" | "edgar-8k";
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
      source: params.source,
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
      console.warn(`[${params.source}] insert failed`, card.externalId, error.message);
      continue;
    }
    n += 1;
  }
  return n;
}

type IngestKind = "exists" | "no-exhibit" | "no-wire" | "skip" | "done";

async function ingestOne(
  client: SupabaseClient,
  source: "edgar-6k" | "edgar-8k",
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
    done.add(row.accession);
    console.log(`[${source}] skip (no Exhibit 99.1)`, listed.ticker, row.accession);
    return { kind: "no-exhibit", inserted: 0 };
  }

  const exhibitName = exhibits[0]!;
  const exhibitUrl = archiveFileUrl(cikNumeric, row.accession, exhibitName);
  const exhibitText = await fetchFilingPlainText(exhibitUrl);
  if (!exhibitText) {
    done.add(row.accession);
    return { kind: "skip", inserted: 0 };
  }

  const classified = classifyExhibit99Dateline(exhibitText, cities);
  if (!classified.isNewswire) {
    done.add(row.accession);
    console.log(`[${source}] skip (no press release in 99.1)`, listed.ticker, row.accession);
    return { kind: "no-wire", inserted: 0 };
  }

  const news = await summarize(exhibitText, "news", source);
  if (!news) {
    done.add(row.accession);
    return { kind: "skip", inserted: 0 };
  }

  const wire = detectListedNewswire(exhibitText) || classified.newswire;
  const summary = withNewswireAttribution(news.summary_lines.join("\n"), wire);

  const publishedAt = publishedIso(row.e.updated);
  const inserted = await insertCards(client, {
    source,
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
  console.log(`[${source}]`, listed.ticker, row.accession, "news", wire);
  return { kind: "done", inserted };
}

async function runTickerCrawl(
  client: SupabaseClient,
  ua: string,
  family: EdgarPressForm,
  tickers: string[],
  latestPerTicker: number
): Promise<SixKCrawlResult> {
  const source = pressSource(family);
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
      console.warn(`[${source}] not in us_listed_companies`, ticker);
      skipped += 1;
      continue;
    }
    const cik = await cikForListed(listed);
    if (!cik) {
      console.warn(`[${source}] no CIK`, ticker);
      skipped += 1;
      continue;
    }

    const xml = await fetchSecAtom(companyAtomUrl(cik, family), ua);
    const parsed = parseFilings(parseAtom(xml), family);
    scanned += parsed.length;

    const existing = await alreadyAccessions(
      client,
      parsed.map((p) => p.accession)
    );
    for (const acc of existing) done.add(acc);

    let taken = 0;
    for (const row of parsed) {
      if (taken >= latestPerTicker) break;
      const result = await ingestOne(client, source, { ...row, cik }, listed, cities, done);
      if (result.kind === "no-exhibit" || result.kind === "no-wire" || result.kind === "skip") {
        skipped += 1;
        continue;
      }
      taken += 1;
      inserted += result.inserted;
      if (result.kind === "exists") skipped += 1;
    }
    if (taken === 0) {
      console.warn(`[${source}] no Exhibit 99.1 with press release`, ticker);
    }
  }

  const message = `${family} done, inserted ${inserted} (tickers ${wanted.join(",")}, scanned ${scanned}, skipped ${skipped})`;
  console.log(message);
  return { ok: true, inserted, scanned, skipped, form: family, tickers: wanted, message };
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

  const families = resolveFamilies(options?.form);

  const tickers = (options?.tickers ?? [])
    .map((t) => normalizeTicker(t))
    .filter(Boolean);
  if (tickers.length) {
    const latest = Math.max(1, options?.latestPerTicker ?? 1);
    let inserted = 0;
    let scanned = 0;
    let skipped = 0;
    const used: string[] = [];
    for (const family of families) {
      const r = await runTickerCrawl(client, ua, family, tickers, latest);
      inserted += r.inserted;
      scanned += r.scanned;
      skipped += r.skipped;
      if (r.tickers) used.push(...r.tickers);
      if (!r.ok) {
        return { ...r, inserted, scanned, skipped, tickers: [...new Set(used)] };
      }
    }
    const label = families.join("+");
    const message = `${label} done, inserted ${inserted} (tickers ${[...new Set(used)].join(",")}, scanned ${scanned}, skipped ${skipped})`;
    console.log(message);
    return { ok: true, inserted, scanned, skipped, tickers: [...new Set(used)], message };
  }

  const queued: QueuedFiling[] = [];
  let scanned = 0;
  let emptyAtoms = 0;
  for (const family of families) {
    const xml = await fetchSecAtom(currentAtomUrl(family), ua);
    const entries = parseAtom(xml);
    if (entries.length === 0) emptyAtoms += 1;
    scanned += entries.length;
    const source = pressSource(family);
    for (const row of parseFilings(entries, family)) {
      queued.push({ ...row, family, source });
    }
  }
  queued.sort(
    (a, b) => Date.parse(b.e.updated) - Date.parse(a.e.updated) || b.accession.localeCompare(a.accession)
  );

  const max =
    options?.maxItems != null
      ? Math.max(0, options.maxItems)
      : Math.max(1, Number(process.env.CRAWL_6K_MAX_ITEMS || DEFAULT_MAX) || DEFAULT_MAX);
  const listedMap = await lookupListedByCiks(
    client,
    queued.map((p) => p.cik)
  );
  const done = options?.seenAccessions ?? new Set<string>();
  const fromDb = await alreadyAccessions(
    client,
    queued.map((p) => p.accession)
  );
  for (const acc of fromDb) done.add(acc);
  const cities = await loadWorldCityNames(client);

  let inserted = 0;
  let skipped = 0;
  const processedByForm: Record<EdgarPressForm, number> = { "8-k": 0, "6-k": 0 };

  for (const row of queued) {
    if (done.has(row.accession)) {
      skipped += 1;
      continue;
    }
    const listed = listedMap.get(row.cik);
    if (!listed) {
      done.add(row.accession);
      skipped += 1;
      continue;
    }
    if (processedByForm[row.family] >= max) continue;
    processedByForm[row.family] += 1;
    const result = await ingestOne(client, row.source, row, listed, cities, done);
    if (result.kind === "exists" || result.kind === "no-exhibit" || result.kind === "no-wire" || result.kind === "skip") {
      skipped += 1;
      continue;
    }
    inserted += result.inserted;
  }

  const processed = processedByForm["8-k"] + processedByForm["6-k"];
  const label = families.join("+");
  const message = `${label} done, inserted ${inserted} (scanned ${scanned}, processed ${processed}, skipped ${skipped})`;
  console.log(message);
  if (emptyAtoms === families.length) {
    return { ok: false, inserted: 0, scanned: 0, skipped, message: `SEC ${label} atom returned 0 entries` };
  }
  return { ok: true, inserted, scanned, skipped, message };
}
