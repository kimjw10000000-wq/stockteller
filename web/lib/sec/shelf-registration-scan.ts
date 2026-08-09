/**
 * SEC EDGAR — 최근 3년 S-3 / F-3 (Shelf Registration) 스캔.
 * 문서 본문 없이 submissions 목록만으로 감지 (빠름).
 */

import { accessionToFolder, resolveTickerMeta, secHeaders } from "@/lib/sec/edgar-client";

const LOOKBACK_MS = 3 * 365.25 * 24 * 60 * 60 * 1000;

const SHELF_FORMS = new Set(["S-3", "S-3/A", "F-3", "F-3/A"]);

export type ShelfRegistrationResult = {
  ok: true;
  ticker: string;
  companyName: string;
  cikPadded: string;
  hasS3: boolean;
  /** ISO YYYY-MM-DD of most recent shelf filing, or null */
  filingDate: string | null;
  /** Display e.g. 2024년 05월 */
  filingDateLabel: string | null;
  formType: string | null;
  filingUrl: string | null;
  filingsScanned: number;
};

export type ShelfRegistrationError = {
  ok: false;
  error: string;
};

function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function formatFilingMonthKo(isoDate: string): string {
  const d = parseIsoDate(isoDate);
  if (!d) return isoDate;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}년 ${m}월`;
}

function baseFormType(form: string): "S-3" | "F-3" | string {
  const u = form.trim().toUpperCase();
  if (u.startsWith("S-3")) return "S-3";
  if (u.startsWith("F-3")) return "F-3";
  return u;
}

function buildFilingUrl(
  cikPadded: string,
  accessionNumber: string,
  primaryDocument: string
): string {
  const cikNum = Number(cikPadded);
  const folder = accessionToFolder(accessionNumber);
  const doc = primaryDocument?.trim();
  if (doc) {
    return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${folder}/${doc}`;
  }
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cikPadded}&type=${encodeURIComponent(
    "S-3"
  )}&dateb=&owner=include&count=40`;
}

export async function scanShelfRegistration(
  tickerInput: string
): Promise<ShelfRegistrationResult | ShelfRegistrationError> {
  const ticker = tickerInput.trim().toUpperCase().replace(/\./g, "-");
  if (!ticker) return { ok: false, error: "티커를 입력하세요." };

  let meta: { cikPadded: string; title: string };
  try {
    const resolved = await resolveTickerMeta(ticker);
    if (!resolved) {
      return { ok: false, error: `SEC에서 티커 ${ticker} 를 찾지 못했습니다.` };
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
      };
    };
  };

  const recent = sub.filings?.recent;
  const forms = recent?.form ?? [];
  const dates = recent?.filingDate ?? [];
  const accessions = recent?.accessionNumber ?? [];
  const primaryDocs = recent?.primaryDocument ?? [];
  const n = Math.min(forms.length, dates.length, accessions.length);
  const cutoff = Date.now() - LOOKBACK_MS;

  type Hit = {
    form: string;
    filingDate: string;
    accessionNumber: string;
    primaryDocument: string;
  };
  const hits: Hit[] = [];

  for (let i = 0; i < n; i++) {
    const form = String(forms[i] ?? "").trim().toUpperCase();
    if (!SHELF_FORMS.has(form)) continue;
    const filingDate = String(dates[i] ?? "").trim();
    const d = parseIsoDate(filingDate);
    if (!d || d.getTime() < cutoff) continue;
    hits.push({
      form,
      filingDate,
      accessionNumber: String(accessions[i] ?? ""),
      primaryDocument: String(primaryDocs[i] ?? ""),
    });
  }

  hits.sort((a, b) => b.filingDate.localeCompare(a.filingDate));
  const latest = hits[0] ?? null;
  const companyName = (sub.name || meta.title || ticker).trim();

  if (!latest) {
    return {
      ok: true,
      ticker,
      companyName,
      cikPadded: meta.cikPadded,
      hasS3: false,
      filingDate: null,
      filingDateLabel: null,
      formType: null,
      filingUrl: null,
      filingsScanned: n,
    };
  }

  return {
    ok: true,
    ticker,
    companyName,
    cikPadded: meta.cikPadded,
    hasS3: true,
    filingDate: latest.filingDate,
    filingDateLabel: formatFilingMonthKo(latest.filingDate),
    formType: baseFormType(latest.form),
    filingUrl: buildFilingUrl(meta.cikPadded, latest.accessionNumber, latest.primaryDocument),
    filingsScanned: n,
  };
}
