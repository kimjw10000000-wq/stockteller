/**
 * SEC EDGAR — 티커 → 최근 8-K 주요 문서 본문(텍스트).
 * @see https://www.sec.gov/os/webmaster-faq#developers
 */

function secHeaders(): HeadersInit {
  const ua =
    process.env.SEC_USER_AGENT?.trim() ||
    "StockResearchBot/1.0 (https://example.com/contact)";
  return {
    "User-Agent": ua,
    Accept: "application/json,text/html,*/*",
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

type TickerEntry = { cik_str: number; ticker: string; title: string };

let cikMapPromise: Promise<Map<string, string>> | null = null;

async function loadCikMap(): Promise<Map<string, string>> {
  if (cikMapPromise) return cikMapPromise;
  cikMapPromise = (async () => {
    const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
      headers: secHeaders(),
      next: { revalidate: 86_400 },
    });
    if (!res.ok) throw new Error(`SEC company_tickers ${res.status}`);
    const raw = (await res.json()) as Record<string, TickerEntry>;
    const map = new Map<string, string>();
    for (const row of Object.values(raw)) {
      if (!row?.ticker) continue;
      const t = String(row.ticker).toUpperCase();
      const cikPadded = String(row.cik_str).padStart(10, "0");
      map.set(t, cikPadded);
    }
    return map;
  })();
  return cikMapPromise;
}

export async function resolveCikPadded(ticker: string): Promise<string | null> {
  const t = ticker.trim().toUpperCase();
  if (!/^[A-Z.\-]{1,10}$/.test(t)) return null;
  const map = await loadCikMap();
  const direct = map.get(t);
  if (direct) return direct;
  const br = map.get(t.replace(/\./g, "-"));
  if (br) return br;
  return null;
}

function accessionToFolder(acc: string): string {
  return acc.replace(/-/g, "");
}

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
