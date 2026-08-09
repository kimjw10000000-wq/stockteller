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
  /**
   * SEC acceptanceDateTime → ISO 8601 UTC
   * e.g. "2026-07-23T20:15:00.000Z"
   */
  filingDateTime: string | null;
  /** @deprecated use filingDateTime + client local format */
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

/**
 * Parse SEC acceptanceDateTime into UTC ISO.
 * Handles:
 * - `2024-11-01T10:49:43.000Z` (UTC, modern API)
 * - `2026-07-23 16:15:00` (Eastern wall clock, legacy-style)
 */
export function acceptanceDateTimeToUtcIso(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  // Already ISO with Z or offset
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  // `YYYY-MM-DD HH:mm:ss` → treat as America/New_York wall time
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  const ss = Number(m[6]);

  let utc = Date.UTC(y, mo - 1, day, hh, mm, ss);
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(utc));
    const map: Record<string, string> = {};
    for (const p of parts) {
      if (p.type !== "literal") map[p.type] = p.value;
    }
    const hour = map.hour === "24" ? 0 : Number(map.hour);
    const asUtc = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      hour,
      Number(map.minute),
      Number(map.second)
    );
    const want = Date.UTC(y, mo - 1, day, hh, mm, ss);
    utc += want - asUtc;
  }
  return new Date(utc).toISOString();
}

/**
 * US domestic vs foreign issuer shelf form — decided ONLY from EDGAR `form`
 * in memory. No country column / DB lookup.
 * - S-3* → US domestic shelf
 * - F-3* → foreign private issuer / ADR shelf
 */
export function classifyShelfFormType(form: string): "S-3" | "F-3" | string {
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
        acceptanceDateTime?: string[];
        accessionNumber?: string[];
        primaryDocument?: string[];
      };
    };
  };

  const recent = sub.filings?.recent;
  const forms = recent?.form ?? [];
  const dates = recent?.filingDate ?? [];
  const accepts = recent?.acceptanceDateTime ?? [];
  const accessions = recent?.accessionNumber ?? [];
  const primaryDocs = recent?.primaryDocument ?? [];
  const n = Math.min(forms.length, dates.length, accessions.length);
  const cutoff = Date.now() - LOOKBACK_MS;

  type Hit = {
    form: string;
    filingDate: string;
    filingDateTime: string | null;
    accessionNumber: string;
    primaryDocument: string;
    sortKey: string;
  };
  const hits: Hit[] = [];

  for (let i = 0; i < n; i++) {
    const form = String(forms[i] ?? "").trim().toUpperCase();
    if (!SHELF_FORMS.has(form)) continue;
    const filingDate = String(dates[i] ?? "").trim();
    const d = parseIsoDate(filingDate);
    if (!d || d.getTime() < cutoff) continue;

    const acceptanceRaw = String(accepts[i] ?? "").trim();
    const filingDateTime = acceptanceDateTimeToUtcIso(acceptanceRaw);
    const sortKey = filingDateTime ?? `${filingDate}T23:59:59.000Z`;

    // Also drop if acceptance is older than lookback when available
    if (filingDateTime) {
      const t = new Date(filingDateTime).getTime();
      if (Number.isFinite(t) && t < cutoff) continue;
    }

    hits.push({
      form,
      filingDate,
      filingDateTime,
      accessionNumber: String(accessions[i] ?? ""),
      primaryDocument: String(primaryDocs[i] ?? ""),
      sortKey,
    });
  }

  hits.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
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
      filingDateTime: null,
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
    filingDateTime: latest.filingDateTime,
    filingDateLabel: latest.filingDateTime,
    formType: classifyShelfFormType(latest.form),
    filingUrl: buildFilingUrl(meta.cikPadded, latest.accessionNumber, latest.primaryDocument),
    filingsScanned: n,
  };
}
