import {
  accessionToFolder,
  secHeaders,
  sleep,
  stripHtml,
} from "@/lib/sec/edgar-client";

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

/**
 * Scan recent 8-K/6-K Exhibit 99.1 for newswire keywords.
 * Returns null when no exhibit / no keyword found.
 */
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

    const folder = accessionToFolder(accession);
    const base = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${folder}`;
    const names = await listFilingDocuments(cikNumeric, accession);
    const exhibits = pickExhibit99Names(names);

    const candidates =
      exhibits.length > 0 ? exhibits : primary ? [primary] : [];

    for (const name of candidates) {
      const text = await fetchText(`${base}/${name}`);
      await sleep(FETCH_GAP_MS);
      const wire = text ? detectPrimaryNewswire(text) : null;
      if (wire) return wire;
    }
  }

  return null;
}
