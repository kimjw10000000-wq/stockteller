/**
 * SEC EDGAR — ticker → 최근 2년 8-K/6-K에서 reverse stock split 비율 스캔 + 250:1 한도 계산.
 * 단일 문서·문서 간(45일/동일 비율) 중복을 제거한 뒤 누적 곱을 계산합니다.
 */

import {
  accessionToFolder,
  resolveTickerMeta,
  secHeaders,
  sleep,
  stripHtml,
} from "@/lib/sec/edgar-client";

const LOOKBACK_MS = 2 * 365.25 * 24 * 60 * 60 * 1000;
const NASDAQ_CUMULATIVE_LIMIT = 250;
/** Hobby serverless ~10s 한도 고려 — 우선순위 높은 공시부터 */
const MAX_DOCS_TO_FETCH = 14;
const FETCH_GAP_MS = 120;
/** 동일 비율 + 이 일수 이내 → 동일 병합 이벤트 */
export const SAME_EVENT_WINDOW_DAYS = 45;

const SPLIT_FORMS = new Set(["8-K", "8-K/A", "6-K", "6-K/A"]);

/** 1-for-N / 1 for N 등 (N = reverse consolidation factor) */
const RATIO_RE =
  /\b1\s*[-–—]\s*for\s*[-–—]?\s*(\d{1,4})\b|\b1\s+for\s+(\d{1,4})\b|\bone\s*[-–—]?\s*for\s*[-–—]?\s*(\d{1,4})\b/gi;

const REVERSE_HINT_RE =
  /\breverse(?:\s+stock)?\s+splits?\b|\breverse\s+split\b|\bconsolidation\s+ratio\b/i;

const EFFECTIVE_EXECUTION_RE = /\beffective\s*date\b|\bsplit[- ]adjusted\b/i;

export type ReverseSplitHit = {
  filingDate: string;
  form: string;
  accessionNumber: string;
  ratioToOne: number;
  ratioLabel: string;
  documentUrl: string;
  viewerUrl: string;
  /** Effective Date / split-adjusted 키워드 포함 → 실행 공시로 우선 */
  isEffectiveExecution: boolean;
  /** 누적 곱에 포함 여부 */
  counted: boolean;
  /** counted=false 일 때 사유 */
  excludeReason?: string;
};

export type ReverseSplitScanResult = {
  ok: true;
  ticker: string;
  companyName: string;
  cikPadded: string;
  lookbackYears: 2;
  filingsScanned: number;
  filingsFetched: number;
  /** 합산 대상 (counted=true) */
  hits: ReverseSplitHit[];
  /** 중복 안건으로 제외된 공시 */
  excludedHits: ReverseSplitHit[];
  cumulativeRatio: number;
  remainingRatio: number | null;
  blocked: boolean;
  statusMessage: string;
  remainingMessage: string;
};

export type ReverseSplitScanError = {
  ok: false;
  error: string;
};

export type ExtractedSplit = {
  ratioToOne: number;
  isEffectiveExecution: boolean;
};

type FilingCandidate = {
  form: string;
  filingDate: string;
  accessionNumber: string;
  primaryDocument: string;
  items: string;
  priority: number;
};

function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function daysBetween(a: string, b: string): number | null {
  const da = parseIsoDate(a);
  const db = parseIsoDate(b);
  if (!da || !db) return null;
  return Math.abs(Math.round((da.getTime() - db.getTime()) / 86_400_000));
}

function daysAgoCutoff(): Date {
  return new Date(Date.now() - LOOKBACK_MS);
}

function filingPriority(items: string, form: string): number {
  const i = items.toLowerCase();
  let p = 0;
  if (/\b3\.03\b/.test(i)) p += 30;
  if (/\b5\.03\b/.test(i)) p += 20;
  if (/\b8\.01\b/.test(i)) p += 10;
  if (form.startsWith("8-K")) p += 2;
  if (form.startsWith("6-K")) p += 1;
  return p;
}

/**
 * 본문에서 reverse split 맥락의 1-for-N 비율 1개만 추출 (최초 매치 후 종료).
 */
export function extractReverseSplitRatio(plainText: string): ExtractedSplit | null {
  if (!plainText || plainText.length < 40) return null;
  const hasReverseHint = REVERSE_HINT_RE.test(plainText);
  const isEffectiveExecution = EFFECTIVE_EXECUTION_RE.test(plainText);
  const re = new RegExp(RATIO_RE.source, RATIO_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(plainText)) !== null) {
    const n = Number(m[1] || m[2] || m[3]);
    if (!Number.isFinite(n) || n < 2 || n > 5000) continue;

    const idx = m.index ?? 0;
    const window = plainText.slice(Math.max(0, idx - 160), idx + (m[0]?.length ?? 0) + 160);
    const localReverse = REVERSE_HINT_RE.test(window) || /\breverse\b/i.test(window);

    if (hasReverseHint || localReverse) {
      return { ratioToOne: n, isEffectiveExecution };
    }
  }
  return null;
}

function formatRemaining(n: number): string {
  if (Number.isInteger(n)) return String(n);
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}

export function computeLimitSummary(ratios: number[]): {
  cumulativeRatio: number;
  remainingRatio: number | null;
  blocked: boolean;
  statusMessage: string;
  remainingMessage: string;
} {
  if (ratios.length === 0) {
    return {
      cumulativeRatio: 1,
      remainingRatio: NASDAQ_CUMULATIVE_LIMIT,
      blocked: false,
      statusMessage: "2년 내 병합 이력 없음 — 누적 1대 1",
      remainingMessage: "남은 가능 병합 비율: 최대 250대 1 가능",
    };
  }

  const cumulativeRatio = ratios.reduce((acc, n) => acc * n, 1);
  const remainingRatio = NASDAQ_CUMULATIVE_LIMIT / cumulativeRatio;
  const blocked = remainingRatio <= 1;

  if (blocked) {
    return {
      cumulativeRatio,
      remainingRatio,
      blocked: true,
      statusMessage: "🚨 [더 이상 추가 병합 불가 (250대 1 한도 초과)]",
      remainingMessage: `누적 ${cumulativeRatio}대 1 — 추가 병합 한도 소진 (잔여 ${formatRemaining(remainingRatio)}대 1)`,
    };
  }

  return {
    cumulativeRatio,
    remainingRatio,
    blocked: false,
    statusMessage: `누적 병합 비율: ${cumulativeRatio}대 1`,
    remainingMessage: `남은 가능 병합 비율: 최대 1대 ${formatRemaining(remainingRatio)}`,
  };
}

function pickClusterWinner(cluster: ReverseSplitHit[]): ReverseSplitHit {
  const effective = cluster.filter((h) => h.isEffectiveExecution);
  const pool = effective.length > 0 ? effective : cluster;
  return [...pool].sort((a, b) => {
    // 실행 공시 우선 후, 더 늦은 제출일(승인→실행 순서)
    const dateCmp = b.filingDate.localeCompare(a.filingDate);
    if (dateCmp !== 0) return dateCmp;
    return a.accessionNumber.localeCompare(b.accessionNumber);
  })[0];
}

/**
 * 동일 비율 + 제출일 45일 이내 → 동일 이벤트 클러스터.
 * 클러스터당 1건만 합산 (Effective Date / split-adjusted 우선).
 */
export function dedupeReverseSplitHits(rawHits: ReverseSplitHit[]): {
  counted: ReverseSplitHit[];
  excluded: ReverseSplitHit[];
} {
  if (rawHits.length === 0) return { counted: [], excluded: [] };

  const sorted = [...rawHits].sort((a, b) => {
    const d = a.filingDate.localeCompare(b.filingDate);
    if (d !== 0) return d;
    return a.accessionNumber.localeCompare(b.accessionNumber);
  });

  const clusters: ReverseSplitHit[][] = [];

  for (const hit of sorted) {
    let placed = false;
    for (const cluster of clusters) {
      if (cluster[0].ratioToOne !== hit.ratioToOne) continue;
      const near = cluster.some((member) => {
        const days = daysBetween(member.filingDate, hit.filingDate);
        return days !== null && days <= SAME_EVENT_WINDOW_DAYS;
      });
      if (near) {
        cluster.push(hit);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([hit]);
  }

  const counted: ReverseSplitHit[] = [];
  const excluded: ReverseSplitHit[] = [];

  for (const cluster of clusters) {
    const winner = pickClusterWinner(cluster);
    for (const hit of cluster) {
      if (hit.accessionNumber === winner.accessionNumber) {
        counted.push({
          ...hit,
          counted: true,
          excludeReason: undefined,
        });
      } else {
        excluded.push({
          ...hit,
          counted: false,
          excludeReason: "중복 안건 제외됨",
        });
      }
    }
  }

  counted.sort((a, b) => b.filingDate.localeCompare(a.filingDate));
  excluded.sort((a, b) => b.filingDate.localeCompare(a.filingDate));
  return { counted, excluded };
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
  const html = await res.text();
  return stripHtml(html);
}

export async function scanReverseSplitsForTicker(
  tickerInput: string
): Promise<ReverseSplitScanResult | ReverseSplitScanError> {
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

  const subUrl = `https://data.sec.gov/submissions/CIK${meta.cikPadded}.json`;
  const subRes = await fetch(subUrl, { headers: secHeaders(), cache: "no-store" });
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

  const cutoff = daysAgoCutoff();
  const candidates: FilingCandidate[] = [];

  for (let i = 0; i < forms.length; i++) {
    const form = forms[i] ?? "";
    if (!SPLIT_FORMS.has(form)) continue;
    const filingDate = dates[i] ?? "";
    const d = parseIsoDate(filingDate);
    if (!d || d < cutoff) continue;
    const accessionNumber = accs[i] ?? "";
    const primaryDocument = docs[i] ?? "";
    if (!accessionNumber || !primaryDocument) continue;
    const items = itemsArr[i] ?? "";
    candidates.push({
      form,
      filingDate,
      accessionNumber,
      primaryDocument,
      items,
      priority: filingPriority(items, form),
    });
  }

  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.filingDate.localeCompare(a.filingDate);
  });

  const toFetch = candidates.slice(0, MAX_DOCS_TO_FETCH);
  const cikNumeric = parseInt(meta.cikPadded, 10);
  const rawHits: ReverseSplitHit[] = [];

  for (let i = 0; i < toFetch.length; i++) {
    const c = toFetch[i];
    if (i > 0) await sleep(FETCH_GAP_MS);
    const text = await fetchFilingPlainText(cikNumeric, c.accessionNumber, c.primaryDocument);
    if (!text) continue;
    const extracted = extractReverseSplitRatio(text);
    if (extracted == null) continue;

    rawHits.push({
      filingDate: c.filingDate,
      form: c.form,
      accessionNumber: c.accessionNumber,
      ratioToOne: extracted.ratioToOne,
      ratioLabel: `1대 ${extracted.ratioToOne}`,
      documentUrl: `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accessionToFolder(c.accessionNumber)}/${c.primaryDocument}`,
      viewerUrl: `https://www.sec.gov/cgi-bin/viewer?action=view&cik=${encodeURIComponent(meta.cikPadded)}&accession_number=${encodeURIComponent(c.accessionNumber)}&xbrl_type=v`,
      isEffectiveExecution: extracted.isEffectiveExecution,
      counted: true,
    });
  }

  const { counted, excluded } = dedupeReverseSplitHits(rawHits);
  const ratios = counted.map((h) => h.ratioToOne);
  const limit = computeLimitSummary(ratios);

  return {
    ok: true,
    ticker,
    companyName,
    cikPadded: meta.cikPadded,
    lookbackYears: 2,
    filingsScanned: candidates.length,
    filingsFetched: toFetch.length,
    hits: counted,
    excludedHits: excluded,
    ...limit,
  };
}
