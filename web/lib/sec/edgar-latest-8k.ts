/**
 * SEC EDGAR — 티커 → 최근 8-K 주요 문서 본문(텍스트).
 * @see https://www.sec.gov/os/webmaster-faq#developers
 */

import {
  accessionToFolder,
  resolveCikPadded,
  secHeaders,
  stripHtml,
} from "@/lib/sec/edgar-client";

export { resolveCikPadded } from "@/lib/sec/edgar-client";

export type Latest8kResult = {
  plainText: string;
  filingDate: string;
  accessionNumber: string;
  primaryDocument: string;
  cikNumeric: number;
  cikPadded: string;
};

/**
 * 가장 최근 8-K / 8-K/A 본문 텍스트.
 */
export async function fetchLatest8kPlainText(ticker: string): Promise<Latest8kResult | null> {
  const cikPadded = await resolveCikPadded(ticker);
  if (!cikPadded) return null;

  const subUrl = `https://data.sec.gov/submissions/CIK${cikPadded}.json`;
  const subRes = await fetch(subUrl, { headers: secHeaders(), cache: "no-store" });
  if (!subRes.ok) return null;

  const sub = (await subRes.json()) as {
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
  const forms = recent?.form;
  const dates = recent?.filingDate;
  const accs = recent?.accessionNumber;
  const docs = recent?.primaryDocument;
  if (!Array.isArray(forms) || !Array.isArray(accs) || !Array.isArray(docs)) return null;

  let accessionNumber = "";
  let filingDate = "";
  let primaryDocument = "";

  for (let i = 0; i < forms.length; i++) {
    const f = forms[i];
    if (f === "8-K" || f === "8-K/A") {
      accessionNumber = accs[i] ?? "";
      filingDate = Array.isArray(dates) ? (dates[i] ?? "") : "";
      primaryDocument = docs[i] ?? "";
      if (accessionNumber && primaryDocument) break;
    }
  }

  if (!accessionNumber || !primaryDocument) return null;

  const cikNumeric = parseInt(cikPadded, 10);
  const folder = accessionToFolder(accessionNumber);
  const docUrl = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${folder}/${primaryDocument}`;

  const docRes = await fetch(docUrl, { headers: secHeaders(), cache: "no-store" });
  if (!docRes.ok) return null;

  const rawHtml = await docRes.text();
  const plainText = stripHtml(rawHtml);
  if (plainText.length < 80) return null;

  return {
    plainText,
    filingDate,
    accessionNumber,
    primaryDocument,
    cikNumeric,
    cikPadded,
  };
}
