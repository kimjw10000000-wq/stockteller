import { secHeaders, sleep } from "@/lib/sec/edgar-client";
import {
  archiveFileUrl,
  fetchFilingPlainText,
  listFilingDocumentNames,
  pickExhibit99_1Names,
} from "@/lib/sec/filing-documents";

export type PrimaryNewswire = "PR Newswire" | "GlobeNewswire" | "Business Wire";

const NEWSWIRE_PATTERNS: Array<{ wire: PrimaryNewswire; re: RegExp }> = [
  { wire: "PR Newswire", re: /\bPR\s*NEWSWIRE\b|\bPRNewswire\b/i },
  { wire: "GlobeNewswire", re: /\bGLOBE\s*NEWSWIRE\b|\bGlobeNewswire\b/i },
  { wire: "Business Wire", re: /\bBUSINESS\s*WIRE\b/i },
];

const FORM_8K = new Set(["8-K", "8-K/A"]);
const FORM_6K = new Set(["6-K", "6-K/A"]);
const MAX_FILINGS = 8;
const FETCH_GAP_MS = 120;

/** Pure text → newswire label (first match wins by priority order above). */
export function detectPrimaryNewswire(text: string): PrimaryNewswire | null {
  if (!text) return null;
  for (const { wire, re } of NEWSWIRE_PATTERNS) {
    if (re.test(text)) return wire;
  }
  return null;
}

/** Scan recent 8-K/6-K Exhibit 99.1 for newswire keywords. */
export async function detectNewswireForCik(
  cikPadded: string
): Promise<PrimaryNewswire | null> {
  const subRes = await fetch(`https://data.sec.gov/submissions/CIK${cikPadded}.json`, {
    headers: secHeaders(),
    cache: "no-store",
  });
  if (!subRes.ok) return null;

  const sub = (await subRes.json()) as {
    filings?: {
      recent?: {
        form?: string[];
        accessionNumber?: string[];
        primaryDocument?: string[];
      };
    };
  };

  const recent = sub.filings?.recent;
  const forms = recent?.form ?? [];
  const accessions = recent?.accessionNumber ?? [];
  const primaryDocs = recent?.primaryDocument ?? [];
  const n = Math.min(forms.length, accessions.length, primaryDocs.length);
  const cikNumeric = Number(cikPadded);

  let scanned = 0;
  for (let i = 0; i < n && scanned < MAX_FILINGS; i++) {
    const form = String(forms[i] ?? "").trim().toUpperCase();
    if (!FORM_8K.has(form) && !FORM_6K.has(form)) continue;
    scanned += 1;

    const accession = String(accessions[i] ?? "");
    const primary = String(primaryDocs[i] ?? "");
    if (!accession) continue;

    const names = await listFilingDocumentNames(cikNumeric, accession);
    const exhibits = pickExhibit99_1Names(names);

    const candidates =
      exhibits.length > 0 ? exhibits : primary ? [primary] : [];

    for (const name of candidates) {
      const text = await fetchFilingPlainText(archiveFileUrl(cikNumeric, accession, name));
      await sleep(FETCH_GAP_MS);
      const wire = text ? detectPrimaryNewswire(text) : null;
      if (wire) return wire;
    }
  }

  return null;
}
