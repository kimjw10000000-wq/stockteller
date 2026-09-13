import { secFetch } from "@/lib/sec/edgar-client";
import { issuerNamesEqual } from "./issuer-name";

const FORMS = new Set([
  "8-A12B",
  "8-A12B/A",
  "10-12B",
  "10-12B/A",
  "20FR12B",
  "20FR12B/A",
]);

export type Edgar12bHit = {
  cik: string;
  companyName: string;
  form: string;
  filed: string;
};

function padCik(raw: string): string {
  return raw.replace(/\D/g, "").padStart(10, "0");
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function quarterUtc(d: Date): number {
  return Math.floor(d.getUTCMonth() / 3) + 1;
}

function masterUrl(d: Date): string {
  return `https://www.sec.gov/Archives/edgar/daily-index/${d.getUTCFullYear()}/QTR${quarterUtc(d)}/master.${ymd(d)}.idx`;
}

function parseMasterIdx(text: string): Edgar12bHit[] {
  const out: Edgar12bHit[] = [];
  let started = false;
  for (const line of text.split(/\r?\n/)) {
    if (!started) {
      if (line.startsWith("CIK|")) started = true;
      continue;
    }
    const cols = line.split("|");
    if (cols.length < 5) continue;
    const form = (cols[2] ?? "").trim().toUpperCase();
    if (!FORMS.has(form)) continue;
    const cik = padCik(cols[0] ?? "");
    const companyName = (cols[1] ?? "").trim();
    const filed = (cols[3] ?? "").trim();
    if (!cik || cik === "0000000000" || !companyName) continue;
    out.push({ cik, companyName, form, filed });
  }
  return out;
}

export async function loadRecent12bFilings(days = 45): Promise<Edgar12bHit[]> {
  const hits: Edgar12bHit[] = [];
  const seen = new Set<string>();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() - i);
    const res = await secFetch(masterUrl(d));
    if (res.status === 404) continue;
    if (!res.ok) continue;
    for (const row of parseMasterIdx(await res.text())) {
      const key = `${row.cik}|${row.form}|${row.filed}|${row.companyName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(row);
    }
  }
  hits.sort((a, b) => b.filed.localeCompare(a.filed));
  return hits;
}

/** Newest-first. First exact issuer-name match wins; stop scanning. */
export function matchIssuerNameTo12b(
  securityName: string,
  filings: Edgar12bHit[]
): Edgar12bHit | null {
  for (const row of filings) {
    if (issuerNamesEqual(securityName, row.companyName)) return row;
  }
  return null;
}

export async function lookupCikFromRecent12b(securityName: string): Promise<Edgar12bHit | null> {
  const filings = await loadRecent12bFilings(45);
  return matchIssuerNameTo12b(securityName, filings);
}
