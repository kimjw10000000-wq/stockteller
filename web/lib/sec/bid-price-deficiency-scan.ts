/**
 * SEC EDGAR — 최근 8개월 bid-price 위반 공시 수집.
 *
 * Condition = Document_Type_Check AND Price_Keyword_Check
 * - Document_Type_Check (OR): 8-K Item 3.01 구역  |  6-K Exhibit 99.1 또는 본문
 * - Price_Keyword_Check (OR): "$1.00"  |  "$0.10"
 */

import {
  accessionToFolder,
  resolveTickerMeta,
  secHeaders,
  sleep,
  stripHtml,
} from "@/lib/sec/edgar-client";
import { getComplianceSeedTicker } from "@/lib/compliance-seed-tickers";

const LOOKBACK_MS = 8 * 30.44 * 24 * 60 * 60 * 1000;
/** 누락 최소화 — 8개월 후보를 최대한 순회 */
const MAX_DOCS = 48;
const FETCH_GAP_MS = 100;

const FORM_8K = new Set(["8-K", "8-K/A"]);
const FORM_6K = new Set(["6-K", "6-K/A"]);

/** Price_Keyword_Check: $1.00 OR $0.10 */
const BID_PRICE_AMOUNT_RE = /\$1\.00\b|\$0\.10\b/i;

export type BidPriceNoticeHit = {
  filingDate: string;
  form: string;
  accessionNumber: string;
  sourceLabel: string;
  documentUrl: string;
  viewerUrl: string;
};

export type BidPriceNoticeResult = {
  ok: true;
  ticker: string;
  companyName: string;
  cikPadded: string;
  found: boolean;
  /** 최신순 Filing Date 배열 */
  filingDates: string[];
  hits: BidPriceNoticeHit[];
  /** @deprecated 호환 — 최신 1건 */
  hit: BidPriceNoticeHit | null;
  filingsScanned: number;
  filingsFetched: number;
};

export type BidPriceNoticeError = {
  ok: false;
  error: string;
};

export function textHasBidPriceAmount(plainText: string): boolean {
  return BID_PRICE_AMOUNT_RE.test(plainText);
}

/**
 * 8-K 본문에서 Item 3.01 섹션만 추출.
 * 마커를 못 찾으면 null (전체 문서 오탐 방지 — items에 3.01이 있을 때만 후보로 옴).
 */
export function extractItem301Section(plainText: string): string | null {
  if (!plainText) return null;
  const start = plainText.search(/Item\s*3\.01\b/i);
  if (start < 0) return null;
  const rest = plainText.slice(start);
  const next = rest.search(/\n\s*Item\s*(?!3\.01)\d{1,2}\.\d{2}\b/i);
  return (next >= 0 ? rest.slice(0, next) : rest).trim() || null;
}

function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function hasItem301(items: string): boolean {
  return /\b3\.01\b/.test(items);
}

async function fetchText(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: secHeaders(), cache: "no-store" });
  if (!res.ok) return null;
  return stripHtml(await res.text());
}

async function listFilingDocuments(
  cikNumeric: number,
  accessionNumber: string
): Promise<string[]> {
  const folder = accessionToFolder(accessionNumber);
  const indexUrl = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${folder}/index.json`;
  try {
    const res = await fetch(indexUrl, { headers: secHeaders(), cache: "no-store" });
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

type Cand = {
  form: string;
  filingDate: string;
  accessionNumber: string;
  primaryDocument: string;
  kind: "8k-301" | "6k";
};

async function scanCandidateText(
  cikNumeric: number,
  c: Cand
): Promise<{ matched: boolean; sourceLabel: string; documentUrl: string }> {
  const folder = accessionToFolder(c.accessionNumber);
  const base = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${folder}`;

  // Document_Type ∩ Price_Keyword
  if (c.kind === "8k-301") {
    const documentUrl = `${base}/${c.primaryDocument}`;
    const text = await fetchText(documentUrl);
    if (!text) return { matched: false, sourceLabel: `${c.form} Item 3.01`, documentUrl };
    const section = extractItem301Section(text);
    // Item 3.01 구역에서만 Price_Keyword 검사 (AND)
    const scope = section ?? "";
    return {
      matched: Boolean(section && textHasBidPriceAmount(scope)),
      sourceLabel: `${c.form} Item 3.01`,
      documentUrl,
    };
  }

  // 6-K Document_Type: Exhibit 99.1 OR 본문 — 각 구역에서 Price_Keyword AND
  const names = await listFilingDocuments(cikNumeric, c.accessionNumber);
  const exhibits = pickExhibit99Names(names);
  for (const name of exhibits) {
    const documentUrl = `${base}/${name}`;
    const text = await fetchText(documentUrl);
    if (text && textHasBidPriceAmount(text)) {
      return { matched: true, sourceLabel: `${c.form} Exhibit 99.1`, documentUrl };
    }
    await sleep(FETCH_GAP_MS);
  }

  const documentUrl = `${base}/${c.primaryDocument}`;
  const body = await fetchText(documentUrl);
  return {
    matched: Boolean(body && textHasBidPriceAmount(body)),
    sourceLabel: `${c.form} 본문`,
    documentUrl,
  };
}

export async function scanBidPriceDeficiencyNotice(
  tickerInput: string
): Promise<BidPriceNoticeResult | BidPriceNoticeError> {
  const ticker = tickerInput.trim().toUpperCase();
  if (!ticker) return { ok: false, error: "티커를 입력하세요." };

  const seed = getComplianceSeedTicker(ticker);
  if (!seed) {
    return { ok: false, error: "현재 등록되지 않거나 조회할 수 없는 티커입니다." };
  }

  let meta: { cikPadded: string; title: string };
  try {
    const resolved = await resolveTickerMeta(ticker);
    if (!resolved) {
      return {
        ok: false,
        error: `시드에는 있으나 SEC에서 티커 ${ticker} CIK를 찾지 못했습니다.`,
      };
    }
    meta = resolved;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `SEC 티커 맵 조회 실패: ${msg}` };
  }

  const subRes = await fetch(`https://data.sec.gov/submissions/CIK${meta.cikPadded}.json`, {
    headers: secHeaders(),
    cache: "no-store",
  });
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
        items?: string[];
      };
    };
  };

  const companyName = seed.companyName || (sub.name || meta.title || ticker).trim();
  const recent = sub.filings?.recent;
  const forms = recent?.form ?? [];
  const dates = recent?.filingDate ?? [];
  const accs = recent?.accessionNumber ?? [];
  const docs = recent?.primaryDocument ?? [];
  const itemsArr = recent?.items ?? [];

  const cutoff = new Date(Date.now() - LOOKBACK_MS);
  const candidates: Cand[] = [];

  for (let i = 0; i < forms.length; i++) {
    const form = forms[i] ?? "";
    const filingDate = dates[i] ?? "";
    const d = parseIsoDate(filingDate);
    if (!d || d < cutoff) continue;
    const accessionNumber = accs[i] ?? "";
    const primaryDocument = docs[i] ?? "";
    if (!accessionNumber || !primaryDocument) continue;
    const items = itemsArr[i] ?? "";

    if (FORM_8K.has(form) && hasItem301(items)) {
      candidates.push({
        form,
        filingDate,
        accessionNumber,
        primaryDocument,
        kind: "8k-301",
      });
      continue;
    }
    if (FORM_6K.has(form)) {
      candidates.push({
        form,
        filingDate,
        accessionNumber,
        primaryDocument,
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
    const scanned = await scanCandidateText(cikNumeric, c);
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
    });
  }

  hits.sort((a, b) => b.filingDate.localeCompare(a.filingDate));
  const filingDates = hits.map((h) => h.filingDate);

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
  };
}
