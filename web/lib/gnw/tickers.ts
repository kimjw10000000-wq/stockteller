const LISTED_TAG =
  /(?:nasdaq(?:cm|gm|gs)?|nyse\s*american|nyse\s*mkt|nyse|amex|otcqb|otcqx|otcbb|otc)\s*:\s*([A-Z][A-Z0-9.\-]{0,7})/gi;

const NANO_MAX = 50_000_000;
const MICRO_MAX = 300_000_000;

export function normalizeTicker(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\./g, "-");
}

export function normalizeCik(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const padded = digits.padStart(10, "0");
  if (padded.length > 10 || padded === "0000000000") return null;
  return padded;
}

export function parseGnwStockTags(tags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const text = String(raw ?? "");
    LISTED_TAG.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LISTED_TAG.exec(text))) {
      const ticker = normalizeTicker(m[1]);
      if (!ticker || seen.has(ticker)) continue;
      seen.add(ticker);
      out.push(ticker);
    }
  }
  return out;
}

export function parseGnwCiks(texts: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /\bCIK[:\s#-]*(\d{1,10})\b/gi;
  for (const raw of texts) {
    const text = String(raw ?? "");
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const cik = normalizeCik(m[1]);
      if (!cik || seen.has(cik)) continue;
      seen.add(cik);
      out.push(cik);
    }
  }
  return out;
}

export function normalizeCompanyName(raw: string): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[.,'"()/]/g, " ")
    .replace(/\b(INCORPORATED|INC|CORPORATION|CORP|COMPANY|CO|LTD|LIMITED|LLC|PLC|SA|AG|NV)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isActiveIssuer(row: { is_active?: boolean | null } | null | undefined): boolean {
  if (!row) return false;
  return row.is_active !== false;
}

export function namesLikelyMatch(a: string, b: string): boolean {
  const left = normalizeCompanyName(a);
  const right = normalizeCompanyName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 10 && right.includes(left)) return true;
  if (right.length >= 10 && left.includes(right)) return true;
  return false;
}

export function capBucket(marketCap: number | null | undefined): "nano" | "micro" | null {
  if (marketCap == null || !Number.isFinite(marketCap) || marketCap <= 0) return null;
  if (marketCap < NANO_MAX) return "nano";
  if (marketCap < MICRO_MAX) return "micro";
  return null;
}
