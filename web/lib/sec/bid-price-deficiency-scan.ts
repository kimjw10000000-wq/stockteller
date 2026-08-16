/**
 * SEC EDGAR — bid-price ($1.00) deficiency notices.
 *
 * US: 8-K Item 3.01, dates only from $1.00 / 5550(a)(2) paragraphs.
 * Foreign: 6-K title/description filter, then Exhibit 99.1 only, same paragraph isolation.
 */

import {
  accessionToFolder,
  resolveTickerMeta,
  secFetch,
  sleep,
} from "@/lib/sec/edgar-client";
import {
  parseBidPriceDatesFromHtml,
  sixKMetaLooksRelevant,
  type BidPriceDateExtract,
  type BidPriceEventKind,
} from "@/lib/sec/bid-price-paragraph-parse";

const LOOKBACK_MS = 8 * 30.44 * 24 * 60 * 60 * 1000;
const MAX_DOCS = 48;
const FETCH_GAP_MS = 100;

const FORM_8K = new Set(["8-K", "8-K/A"]);
const FORM_6K = new Set(["6-K", "6-K/A"]);

export type BidPriceNoticeHit = {
  filingDate: string;
  form: string;
  accessionNumber: string;
  sourceLabel: string;
  documentUrl: string;
  viewerUrl: string;
  noticeDate: string | null;
  deadlineDate: string | null;
  storedDate: string | null;
  storedKind: BidPriceEventKind | null;
  excerpt: string | null;
};

export type BidPriceNoticeResult = {
  ok: true;
  ticker: string;
  companyName: string;
  cikPadded: string;
  found: boolean;
  filingDates: string[];
  hits: BidPriceNoticeHit[];
  /** @deprecated 호환 — 최신 1건 */
  hit: BidPriceNoticeHit | null;
  filingsScanned: number;
  filingsFetched: number;
  canonicalDate: string | null;
  canonicalKind: BidPriceEventKind | null;
};

export type BidPriceNoticeError = {
  ok: false;
  error: string;
};

export type ScanBidPriceOptions = {
  issuerType?: "DOMESTIC" | "FOREIGN" | null;
};

function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function hasItem301(items: string): boolean {
  return /\b3\.01\b/.test(items);
}

async function fetchHtml(url: string): Promise<string | null> {
  const res = await secFetch(url);
  if (!res.ok) return null;
  return res.text();
}

async function listFilingDocuments(
  cikNumeric: number,
  accessionNumber: string
): Promise<string[]> {
  const folder = accessionToFolder(accessionNumber);
  const indexUrl = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${folder}/index.json`;
  try {
    const res = await secFetch(indexUrl);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      directory?: { item?: Array<{ name?: string }> | { name?: string } };
    };
    const raw = data.directory?.item;
    const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return items.map((it) => String(it.name ?? "")).filter(Boolean);
  } catch {
    return [];
  }
}

function pickExhibit99Names(names: string[]): string[] {
  return names.filter((n) => {
    const lower = n.toLowerCase();
    return (
      /ex[-_.]?99\.?1/i.test(lower) ||
      /exhibit[-_.]?99\.?1/i.test(lower) ||
      (/99\.1/.test(lower) && /\.(htm|html|txt)$/i.test(lower))
    );
  });
}

async function filingSummaryBlob(
  cikNumeric: number,
  accessionNumber: string
): Promise<string> {
  const folder = accessionToFolder(accessionNumber);
  const url = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${folder}/FilingSummary.xml`;
  const html = await fetchHtml(url);
  return html ?? "";
}

type Cand = {
  form: string;
  filingDate: string;
  accessionNumber: string;
  primaryDocument: string;
  primaryDocDescription: string;
  kind: "8k-301" | "6k";
};

function emptyExtract(): BidPriceDateExtract {
  return {
    noticeDate: null,
    deadlineDate: null,
    storedDate: null,
    storedKind: null,
    excerpt: null,
  };
}

function extractLooksLikeHit(parsed: BidPriceDateExtract | null): boolean {
  if (!parsed) return false;
  return Boolean(parsed.storedDate || parsed.excerpt);
}

async function scanCandidateHtml(
  cikNumeric: number,
  c: Cand
): Promise<{
  matched: boolean;
  sourceLabel: string;
  documentUrl: string;
  dates: BidPriceDateExtract;
}> {
  const folder = accessionToFolder(c.accessionNumber);
  const base = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${folder}`;

  if (c.kind === "8k-301") {
    const documentUrl = `${base}/${c.primaryDocument}`;
    const html = await fetchHtml(documentUrl);
    const dates = html ? parseBidPriceDatesFromHtml(html, "us-8k") : null;
    return {
      matched: extractLooksLikeHit(dates),
      sourceLabel: `${c.form} Item 3.01`,
      documentUrl,
      dates: dates ?? emptyExtract(),
    };
  }

  const metaBits = [c.primaryDocDescription];
  const summary = await filingSummaryBlob(cikNumeric, c.accessionNumber);
  if (summary) metaBits.push(summary);
  if (!sixKMetaLooksRelevant(metaBits.join("\n"))) {
    return {
      matched: false,
      sourceLabel: `${c.form} skipped`,
      documentUrl: `${base}/${c.primaryDocument}`,
      dates: emptyExtract(),
    };
  }

  const names = await listFilingDocuments(cikNumeric, c.accessionNumber);
  const exhibits = pickExhibit99Names(names);
  for (const name of exhibits) {
    const documentUrl = `${base}/${name}`;
    const html = await fetchHtml(documentUrl);
    const dates = html ? parseBidPriceDatesFromHtml(html, "foreign-6k") : null;
    if (extractLooksLikeHit(dates)) {
      return {
        matched: true,
        sourceLabel: `${c.form} Exhibit 99.1`,
        documentUrl,
        dates: dates ?? emptyExtract(),
      };
    }
    await sleep(FETCH_GAP_MS);
  }

  return {
    matched: false,
    sourceLabel: `${c.form} Exhibit 99.1`,
    documentUrl: `${base}/${c.primaryDocument}`,
    dates: emptyExtract(),
  };
}

export function pickCanonicalHit(hits: BidPriceNoticeHit[]): BidPriceNoticeHit | null {
  if (hits.length === 0) return null;
  const sorted = [...hits].sort((a, b) => b.filingDate.localeCompare(a.filingDate));
  return sorted.find((h) => h.storedDate) ?? sorted[0] ?? null;
}

export async function scanBidPriceDeficiencyNotice(
  tickerInput: string,
  opts?: ScanBidPriceOptions
): Promise<BidPriceNoticeResult | BidPriceNoticeError> {
  const ticker = tickerInput.trim().toUpperCase();
  if (!ticker) return { ok: false, error: "티커를 입력하세요." };

  let meta: { cikPadded: string; title: string };
  try {
    const resolved = await resolveTickerMeta(ticker);
    if (!resolved) {
      return {
        ok: false,
        error: `SEC에서 티커 ${ticker} 를 찾지 못했습니다. (NYSE/NASDAQ 상장 티커인지 확인하세요)`,
      };
    }
    meta = resolved;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `SEC 티커 맵 조회 실패: ${msg}` };
  }

  const subRes = await secFetch(`https://data.sec.gov/submissions/CIK${meta.cikPadded}.json`);
  if (!subRes.ok) {
    return { ok: false, error: `SEC submissions 조회 실패 (${subRes.status})` };
  }

  const sub = (await subRes.json()) as {
    name?: string;
    filings?: {
      recent?: {
        form?: string[];
        filingDate?: string[];
        accessionNumber?: string[];
        primaryDocument?: string[];
        primaryDocDescription?: string[];
        items?: string[];
      };
    };
  };

  const companyName = (sub.name || meta.title || ticker).trim();
  const recent = sub.filings?.recent;
  const forms = recent?.form ?? [];
  const dates = recent?.filingDate ?? [];
  const accs = recent?.accessionNumber ?? [];
  const docs = recent?.primaryDocument ?? [];
  const descs = recent?.primaryDocDescription ?? [];
  const itemsArr = recent?.items ?? [];

  const cutoff = new Date(Date.now() - LOOKBACK_MS);
  const candidates: Cand[] = [];
  const issuer = opts?.issuerType ?? null;
  const want8k = issuer !== "FOREIGN";
  const want6k = issuer !== "DOMESTIC";

  for (let i = 0; i < forms.length; i++) {
    const form = forms[i] ?? "";
    const filingDate = dates[i] ?? "";
    const d = parseIsoDate(filingDate);
    if (!d || d < cutoff) continue;
    const accessionNumber = accs[i] ?? "";
    const primaryDocument = docs[i] ?? "";
    if (!accessionNumber || !primaryDocument) continue;
    const items = itemsArr[i] ?? "";
    const primaryDocDescription = descs[i] ?? "";

    if (want8k && FORM_8K.has(form) && hasItem301(items)) {
      candidates.push({
        form,
        filingDate,
        accessionNumber,
        primaryDocument,
        primaryDocDescription,
        kind: "8k-301",
      });
      continue;
    }
    if (want6k && FORM_6K.has(form)) {
      candidates.push({
        form,
        filingDate,
        accessionNumber,
        primaryDocument,
        primaryDocDescription,
        kind: "6k",
      });
    }
  }

  candidates.sort((a, b) => b.filingDate.localeCompare(a.filingDate));
  const toFetch = candidates.slice(0, MAX_DOCS);
  const cikNumeric = parseInt(meta.cikPadded, 10);
  const hits: BidPriceNoticeHit[] = [];
  const seenAcc = new Set<string>();

  for (let i = 0; i < toFetch.length; i++) {
    const c = toFetch[i];
    if (i > 0) await sleep(FETCH_GAP_MS);
    const scanned = await scanCandidateHtml(cikNumeric, c);
    if (!scanned.matched) continue;
    if (seenAcc.has(c.accessionNumber)) continue;
    seenAcc.add(c.accessionNumber);

    hits.push({
      filingDate: c.filingDate,
      form: c.form,
      accessionNumber: c.accessionNumber,
      sourceLabel: scanned.sourceLabel,
      documentUrl: scanned.documentUrl,
      viewerUrl: `https://www.sec.gov/cgi-bin/viewer?action=view&cik=${encodeURIComponent(meta.cikPadded)}&accession_number=${encodeURIComponent(c.accessionNumber)}&xbrl_type=v`,
      noticeDate: scanned.dates.noticeDate,
      deadlineDate: scanned.dates.deadlineDate,
      storedDate: scanned.dates.storedDate ?? c.filingDate,
      storedKind: scanned.dates.storedKind ?? "notice",
      excerpt: scanned.dates.excerpt,
    });
  }

  hits.sort((a, b) => b.filingDate.localeCompare(a.filingDate));
  const filingDates = hits.map((h) => h.filingDate);
  const canonical = pickCanonicalHit(hits);

  return {
    ok: true,
    ticker,
    companyName,
    cikPadded: meta.cikPadded,
    found: hits.length > 0,
    filingDates,
    hits,
    hit: hits[0] ?? null,
    filingsScanned: candidates.length,
    filingsFetched: toFetch.length,
    canonicalDate: canonical?.storedDate ?? null,
    canonicalKind: canonical?.storedKind ?? null,
  };
}
