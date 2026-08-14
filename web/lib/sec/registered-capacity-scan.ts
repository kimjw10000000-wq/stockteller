/**
 * SEC EDGAR — EFFECT notices → S-1/S-3/F-1/F-3 registered offering capacity.
 *
 * DOMESTIC: S-3ASR → unlimited WKSI; else EFFECT on S-1 / S-3 / POS AM.
 * FOREIGN:  F-3ASR → unlimited WKSI; else EFFECT on F-1 / F-3 / POS AM.
 * ASR forms have no EFFECT. Same file number POS AM overwrites the row.
 * Rule 415(a)(6) Prior Registration No. retires the predecessor within the same CIK only.
 */

import {
  accessionToFolder,
  resolveTickerMeta,
  secFetch,
} from "@/lib/sec/edgar-client";
import {
  isActiveEffectDate,
  isSizedRegistrationForm,
  isWksiAsrForm,
  normalizeRegistrationFormType,
  parseEffectXml,
  parseOfferingAmountFromDocuments,
  parsePriorRegistrationNumbers,
  type FilingStatus,
  type IssuerType,
} from "@/lib/sec/offering-amount-parse";
import { applyShelfRollover, sumActiveShelfCapacity } from "@/lib/sec/shelf-rollover";

const LOOKBACK_MS = 3 * 365.25 * 24 * 60 * 60 * 1000;

export type RegisteredFilingDraft = {
  ticker: string;
  cik: string;
  fileNumber: string;
  formType: string;
  effectDate: string;
  maxOfferingAmount: number | null;
  isActive: boolean;
  status: FilingStatus;
  priorFileNumbers: string[];
  replacedByFileNumber: string | null;
  accessionNumber: string | null;
  filingUrl: string | null;
  parseMethod: string | null;
};

export type RegisteredCapacityScanResult =
  | {
      ok: true;
      ticker: string;
      companyName: string;
      cikPadded: string;
      issuerType: IssuerType;
      isUnlimitedShelf: boolean;
      filings: RegisteredFilingDraft[];
      totalRegisteredOfferingCapacity: number | null;
      effectsScanned: number;
    }
  | { ok: false; error: string };

type RecentFilings = {
  form?: string[];
  filingDate?: string[];
  accessionNumber?: string[];
  primaryDocument?: string[];
  fileNumber?: string[];
};

function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function archiveBase(cikPadded: string, accession: string): string {
  const cikNum = Number(cikPadded);
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accessionToFolder(accession)}`;
}

async function fetchText(url: string): Promise<string | null> {
  const res = await secFetch(url);
  if (!res.ok) return null;
  return res.text();
}

function feeDocName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    /^ex[-_]?107/i.test(n) ||
    /ex[-_]?filing[-_]?fees/i.test(n) ||
    /filingfees/i.test(n) ||
    /exfilingfees/i.test(n)
  );
}

async function fetchFeeAndPrimary(
  cikPadded: string,
  accession: string,
  primaryDocument: string
): Promise<{ fee: string | null; primary: string | null; filingUrl: string | null }> {
  const base = archiveBase(cikPadded, accession);
  const filingUrl = primaryDocument ? `${base}/${primaryDocument}` : `${base}/`;
  let fee: string | null = null;
  const idxJson = await fetchText(`${base}/index.json`);
  if (idxJson) {
    try {
      const idx = JSON.parse(idxJson) as {
        directory?: { item?: Array<{ name?: string }> };
      };
      const items = idx.directory?.item ?? [];
      const xmlFee = items.find((it) => feeDocName(it.name ?? "") && /\.xml$/i.test(it.name ?? ""));
      const htmFee = items.find((it) => feeDocName(it.name ?? "") && /\.(htm|html)$/i.test(it.name ?? ""));
      const pick = xmlFee?.name || htmFee?.name;
      if (pick) fee = await fetchText(`${base}/${pick}`);
    } catch {
      /* ignore */
    }
  }
  if (!fee) {
    fee =
      (await fetchText(`${base}/ex107.htm`)) ||
      (await fetchText(`${base}/exfilingfees.htm`)) ||
      null;
  }
  const primary = primaryDocument ? await fetchText(`${base}/${primaryDocument}`) : null;
  return { fee, primary, filingUrl };
}

function latestFilingForFile(
  recent: RecentFilings,
  fileNumber: string,
  allow: (form: string) => boolean
): {
  form: string;
  filingDate: string;
  accessionNumber: string;
  primaryDocument: string;
} | null {
  const forms = recent.form ?? [];
  const dates = recent.filingDate ?? [];
  const accs = recent.accessionNumber ?? [];
  const docs = recent.primaryDocument ?? [];
  const files = recent.fileNumber ?? [];
  const n = Math.min(forms.length, dates.length, accs.length, files.length);
  let best: {
    form: string;
    filingDate: string;
    accessionNumber: string;
    primaryDocument: string;
    sort: string;
  } | null = null;
  for (let i = 0; i < n; i++) {
    if (String(files[i] ?? "").trim() !== fileNumber) continue;
    const form = String(forms[i] ?? "").trim().toUpperCase();
    if (form === "EFFECT") continue;
    if (!allow(form)) continue;
    const filingDate = String(dates[i] ?? "").trim();
    if (!best || filingDate > best.sort) {
      best = {
        form,
        filingDate,
        accessionNumber: String(accs[i] ?? ""),
        primaryDocument: String(docs[i] ?? ""),
        sort: filingDate,
      };
    }
  }
  return best;
}

function latestSizedRegistrationForFile(
  recent: RecentFilings,
  fileNumber: string,
  issuerType: IssuerType
) {
  return latestFilingForFile(recent, fileNumber, (form) =>
    isSizedRegistrationForm(form, issuerType)
  );
}

function latestAsrForFile(recent: RecentFilings, fileNumber: string, issuerType: IssuerType) {
  return latestFilingForFile(recent, fileNumber, (form) => isWksiAsrForm(form, issuerType));
}

export async function scanRegisteredCapacity(
  tickerInput: string,
  options?: { issuerType?: IssuerType }
): Promise<RegisteredCapacityScanResult> {
  const ticker = tickerInput.trim().toUpperCase().replace(/\./g, "-");
  if (!ticker) return { ok: false, error: "티커를 입력하세요." };

  let meta: { cikPadded: string; title: string };
  try {
    const resolved = await resolveTickerMeta(ticker);
    if (!resolved) return { ok: false, error: `SEC에서 티커 ${ticker} 를 찾지 못했습니다.` };
    meta = resolved;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const subRes = await secFetch(`https://data.sec.gov/submissions/CIK${meta.cikPadded}.json`);
  if (!subRes.ok) return { ok: false, error: `SEC submissions 조회 실패 (${subRes.status})` };

  const sub = (await subRes.json()) as {
    name?: string;
    filings?: { recent?: RecentFilings };
  };
  const recent = sub.filings?.recent ?? {};
  const forms = recent.form ?? [];
  const dates = recent.filingDate ?? [];
  const accs = recent.accessionNumber ?? [];
  const docs = recent.primaryDocument ?? [];
  const files = recent.fileNumber ?? [];
  const n = Math.min(forms.length, dates.length, accs.length);
  const cutoff = Date.now() - LOOKBACK_MS;
  const issuerType: IssuerType = options?.issuerType === "FOREIGN" ? "FOREIGN" : "DOMESTIC";

  type EffectHit = {
    formHint: string;
    fileNumber: string;
    effectDate: string;
    effectAccession: string;
    kind: "sized" | "asr";
  };
  const byFile = new Map<string, EffectHit>();

  let effectsScanned = 0;
  for (let i = 0; i < n; i++) {
    const form = String(forms[i] ?? "").trim().toUpperCase();
    const filingDate = String(dates[i] ?? "").trim();
    const d = parseIsoDate(filingDate);
    if (!d || d.getTime() < cutoff) continue;

    if (form === "EFFECT") {
      effectsScanned += 1;
      const acc = String(accs[i] ?? "");
      const xml =
        (await fetchText(`${archiveBase(meta.cikPadded, acc)}/primary_doc.xml`)) ||
        (await fetchText(`${archiveBase(meta.cikPadded, acc)}/${docs[i] ?? "primary_doc.xml"}`));
      const parsed = xml ? parseEffectXml(xml) : { form: null, fileNumber: null, effectDate: null };
      const fileNumber = parsed.fileNumber || String(files[i] ?? "").trim();
      const targetForm = (parsed.form || "").trim();
      const effectDate = parsed.effectDate || filingDate;
      if (!fileNumber) continue;
      if (targetForm) {
        if (isWksiAsrForm(targetForm, issuerType)) continue;
        if (!isSizedRegistrationForm(targetForm, issuerType)) continue;
      } else if (!latestSizedRegistrationForFile(recent, fileNumber, issuerType)) {
        continue;
      }
      const prev = byFile.get(fileNumber);
      if (!prev || effectDate >= prev.effectDate) {
        byFile.set(fileNumber, {
          formHint: targetForm || form,
          fileNumber,
          effectDate,
          effectAccession: acc,
          kind: "sized",
        });
      }
      continue;
    }

    if (isWksiAsrForm(form, issuerType)) {
      const fileNumber = String(files[i] ?? "").trim() || `ASR-${accs[i]}`;
      const prev = byFile.get(fileNumber);
      if (!prev || filingDate >= prev.effectDate) {
        byFile.set(fileNumber, {
          formHint: form,
          fileNumber,
          effectDate: filingDate,
          effectAccession: String(accs[i] ?? ""),
          kind: "asr",
        });
      }
    }
  }

  const drafts: RegisteredFilingDraft[] = [];
  const hits = Array.from(byFile.values());
  for (const hit of hits) {
    if (hit.kind === "asr") {
      const src = latestAsrForFile(recent, hit.fileNumber, issuerType);
      const acc = src?.accessionNumber || hit.effectAccession;
      const primary = src?.primaryDocument;
      drafts.push({
        ticker,
        cik: meta.cikPadded,
        fileNumber: hit.fileNumber,
        formType: normalizeRegistrationFormType(hit.formHint),
        effectDate: hit.effectDate,
        maxOfferingAmount: null,
        isActive: isActiveEffectDate(hit.effectDate),
        status: isActiveEffectDate(hit.effectDate) ? "ACTIVE" : "EXPIRED",
        priorFileNumbers: [],
        replacedByFileNumber: null,
        accessionNumber: acc || null,
        filingUrl: acc
          ? primary
            ? `${archiveBase(meta.cikPadded, acc)}/${primary}`
            : archiveBase(meta.cikPadded, acc)
          : null,
        parseMethod: "wksi_asr",
      });
      continue;
    }

    const src = latestSizedRegistrationForFile(recent, hit.fileNumber, issuerType);
    let amount: number | null = null;
    let parseMethod: string | null = null;
    let filingUrl: string | null = null;
    let priorFileNumbers: string[] = [];
    const accession = src?.accessionNumber ?? hit.effectAccession;

    if (src?.accessionNumber) {
      const docsFetched = await fetchFeeAndPrimary(
        meta.cikPadded,
        src.accessionNumber,
        src.primaryDocument
      );
      filingUrl = docsFetched.filingUrl;
      const parsed = parseOfferingAmountFromDocuments({
        feeXmlOrHtml: docsFetched.fee,
        primaryHtml: docsFetched.primary,
      });
      if (parsed) {
        amount = parsed.amount;
        parseMethod = parsed.method;
      }
      priorFileNumbers = parsePriorRegistrationNumbers(
        `${docsFetched.fee ?? ""}\n${docsFetched.primary ?? ""}`,
        hit.fileNumber
      );
    }

    const formType = normalizeRegistrationFormType(src?.form || hit.formHint);
    const inWindow = isActiveEffectDate(hit.effectDate);
    drafts.push({
      ticker,
      cik: meta.cikPadded,
      fileNumber: hit.fileNumber,
      formType,
      effectDate: hit.effectDate,
      maxOfferingAmount: amount,
      isActive: inWindow,
      status: inWindow ? "ACTIVE" : "EXPIRED",
      priorFileNumbers,
      replacedByFileNumber: null,
      accessionNumber: accession || null,
      filingUrl,
      parseMethod,
    });
  }

  const rolled = applyShelfRollover(drafts);
  const cap = sumActiveShelfCapacity(rolled, meta.cikPadded);

  return {
    ok: true,
    ticker,
    companyName: (sub.name || meta.title || ticker).trim(),
    cikPadded: meta.cikPadded,
    issuerType,
    isUnlimitedShelf: cap.isUnlimitedShelf,
    filings: rolled,
    totalRegisteredOfferingCapacity: cap.total,
    effectsScanned,
  };
}
