/**
 * SEC EDGAR — Item 3.01 최소 입찰가($1) 미달 통지 문장 스캔 (최근 8개월).
 */

import {
  accessionToFolder,
  resolveTickerMeta,
  secHeaders,
  sleep,
  stripHtml,
} from "@/lib/sec/edgar-client";

const LOOKBACK_MS = 8 * 30.44 * 24 * 60 * 60 * 1000;
const MAX_DOCS = 12;
const FETCH_GAP_MS = 120;

const SPLIT_FORMS = new Set(["8-K", "8-K/A", "6-K", "6-K/A"]);

/** 요구사항 정확 문장 (공백·대소문자 정규화 후 비교) */
export const BID_PRICE_DEFICIENCY_PHRASE =
  "failed to maintain a minimum bid price of at least $1.00 per share";

export type BidPriceNoticeHit = {
  filingDate: string;
  form: string;
  accessionNumber: string;
  documentUrl: string;
  viewerUrl: string;
};

export type BidPriceNoticeResult = {
  ok: true;
  ticker: string;
  companyName: string;
  cikPadded: string;
  found: boolean;
  hit: BidPriceNoticeHit | null;
  filingsScanned: number;
  filingsFetched: number;
};

export type BidPriceNoticeError = {
  ok: false;
  error: string;
};

function normalizeText(s: string): string {
  return s
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function textContainsBidPriceDeficiency(plainText: string): boolean {
  const hay = normalizeText(plainText);
  const needle = normalizeText(BID_PRICE_DEFICIENCY_PHRASE);
  return hay.includes(needle);
}

function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function hasItem301(items: string): boolean {
  return /\b3\.01\b/.test(items);
}

async function fetchFilingPlainText(
  cikNumeric: number,
  accessionNumber: string,
  primaryDocument: string
): Promise<string | null> {
  const folder = accessionToFolder(accessionNumber);
  const docUrl = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${folder}/${primaryDocument}`;
  const res = await fetch(docUrl, { headers: secHeaders(), cache: "no-store" });
  if (!res.ok) return null;
  return stripHtml(await res.text());
}

export async function scanBidPriceDeficiencyNotice(
  tickerInput: string
): Promise<BidPriceNoticeResult | BidPriceNoticeError> {
  const ticker = tickerInput.trim().toUpperCase();
  if (!ticker) return { ok: false, error: "티커를 입력하세요." };

  let meta: { cikPadded: string; title: string };
  try {
    const resolved = await resolveTickerMeta(ticker);
    if (!resolved) return { ok: false, error: `SEC에서 티커 ${ticker}를 찾지 못했습니다.` };
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

  const companyName = (sub.name || meta.title || ticker).trim();
  const recent = sub.filings?.recent;
  const forms = recent?.form ?? [];
  const dates = recent?.filingDate ?? [];
  const accs = recent?.accessionNumber ?? [];
  const docs = recent?.primaryDocument ?? [];
  const itemsArr = recent?.items ?? [];

  const cutoff = new Date(Date.now() - LOOKBACK_MS);
  type Cand = {
    form: string;
    filingDate: string;
    accessionNumber: string;
    primaryDocument: string;
  };
  const candidates: Cand[] = [];

  for (let i = 0; i < forms.length; i++) {
    const form = forms[i] ?? "";
    if (!SPLIT_FORMS.has(form)) continue;
    const items = itemsArr[i] ?? "";
    if (!hasItem301(items)) continue;
    const filingDate = dates[i] ?? "";
    const d = parseIsoDate(filingDate);
    if (!d || d < cutoff) continue;
    const accessionNumber = accs[i] ?? "";
    const primaryDocument = docs[i] ?? "";
    if (!accessionNumber || !primaryDocument) continue;
    candidates.push({ form, filingDate, accessionNumber, primaryDocument });
  }

  // 최신순
  candidates.sort((a, b) => b.filingDate.localeCompare(a.filingDate));

  const toFetch = candidates.slice(0, MAX_DOCS);
  const cikNumeric = parseInt(meta.cikPadded, 10);
  let hit: BidPriceNoticeHit | null = null;

  for (let i = 0; i < toFetch.length; i++) {
    const c = toFetch[i];
    if (i > 0) await sleep(FETCH_GAP_MS);
    const text = await fetchFilingPlainText(cikNumeric, c.accessionNumber, c.primaryDocument);
    if (!text || !textContainsBidPriceDeficiency(text)) continue;

    hit = {
      filingDate: c.filingDate,
      form: c.form,
      accessionNumber: c.accessionNumber,
      documentUrl: `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accessionToFolder(c.accessionNumber)}/${c.primaryDocument}`,
      viewerUrl: `https://www.sec.gov/cgi-bin/viewer?action=view&cik=${encodeURIComponent(meta.cikPadded)}&accession_number=${encodeURIComponent(c.accessionNumber)}&xbrl_type=v`,
    };
    break; // 최신순이므로 첫 매치 = 가장 최근 위반 통지
  }

  return {
    ok: true,
    ticker,
    companyName,
    cikPadded: meta.cikPadded,
    found: Boolean(hit),
    hit,
    filingsScanned: candidates.length,
    filingsFetched: toFetch.length,
  };
}
