/**
 * Extract registered offering dollar amounts from SEC fee exhibits / cover pages.
 * No network — used by the EDGAR capacity scanner and unit tests.
 */

export type OfferingParseHit = {
  amount: number;
  method: "fee_xbrl" | "fee_table" | "cover_regex";
};

export type FilingStatus = "ACTIVE" | "REPLACED" | "EXPIRED";

const SEC_FILE_NO_RE = /(\d{1,3}-\d{4,8})/;

/** Normalize EDGAR Securities Act file numbers (e.g. 333-294668). */
export function normalizeSecFileNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = SEC_FILE_NO_RE.exec(String(raw).replace(/\s/g, ""));
  return m?.[1] ?? null;
}

const XBRL_PRIOR_FILE_RE =
  /<(?:[\w.]+:)?(CfwdPrrFileNb|CarryFwdFileNb|CfwdFileNb|PriorFileNb)(?:\s[^>]*)?>([^<]+)<\//gi;

const IX_PRIOR_FILE_RE =
  /<(?:[\w]+:)?nonNumeric\b[^>]*\bname="(?:[\w]+:)?(CfwdPrrFileNb|CarryFwdFileNb|CfwdFileNb|PriorFileNb)"[^>]*>([^<]+)/gi;

const PRIOR_TEXT_RES: RegExp[] = [
  /prior\s+registration(?:\s+statement)?(?:\s+(?:file\s+)?(?:no\.?|number))?\s*[:.]?\s*(333-\d+)/gi,
  /(?:unsold\s+securities\s+)?(?:carried|carry)\s+forward.{0,160}?(333-\d+)/gi,
  /rule\s*415\s*\(\s*a\s*\)\s*\(\s*6\s*\).{0,220}?(333-\d+)/gi,
  /from\s+registration\s+statement(?:\s+(?:file\s+)?(?:no\.?|number))?\s*(333-\d+)/gi,
];

/**
 * Rule 415(a)(6) prior shelf file numbers from Exhibit 107 / cover text.
 * Never returns `excludeFileNumber` (the current registration).
 */
export function parsePriorRegistrationNumbers(
  htmlOrXml: string,
  excludeFileNumber?: string | null
): string[] {
  const found = new Set<string>();
  const exclude = normalizeSecFileNumber(excludeFileNumber);

  const push = (raw: string) => {
    const n = normalizeSecFileNumber(raw);
    if (!n || n === exclude) return;
    found.add(n);
  };

  let m: RegExpExecArray | null;
  const xbrl = new RegExp(XBRL_PRIOR_FILE_RE.source, XBRL_PRIOR_FILE_RE.flags);
  while ((m = xbrl.exec(htmlOrXml))) push(m[2] ?? "");
  const ix = new RegExp(IX_PRIOR_FILE_RE.source, IX_PRIOR_FILE_RE.flags);
  while ((m = ix.exec(htmlOrXml))) push(m[2] ?? "");

  const plain = stripTags(htmlOrXml);
  for (const reSrc of PRIOR_TEXT_RES) {
    const re = new RegExp(reSrc.source, reSrc.flags);
    while ((m = re.exec(plain))) push(m[1] ?? "");
  }

  return Array.from(found);
}

const COVER_AMOUNT_RES: RegExp[] = [
  /maximum\s+aggregate\s+offering\s+price\s*[:.]?\s*(?:of\s+)?(?:up\s+to\s+)?(?:US)?\$\s*([\d,]+(?:\.\d+)?)/i,
  /(?:an\s+)?aggregate\s+(?:initial\s+)?offering\s+price\s+(?:of\s+)?(?:up\s+to\s+)?(?:US)?\$\s*([\d,]+(?:\.\d+)?)/i,
  /up\s+to\s+(?:an\s+aggregate(?:\s+offering\s+price)?\s+of\s+)?(?:US)?\$\s*([\d,]+(?:\.\d+)?)/i,
];

const XBRL_TOTAL_TAG_RE =
  /<(?:[\w.]+:)?(FeeTableTotalOfferingAmount|FeeTblTotOfferingAmt|TotOfferingAmt|TotOfferingAggtAmt|TotMaxAggtOfferingPrice|FnlMaxAggtOfferingPrice|TotalOfferingAmt|TotalOfferingPrice)(?:\s[^>]*)?>([^<]+)<\//gi;

const IX_TOTAL_TAG_RE =
  /<(?:[\w]+:)?(?:nonNumeric|nonFraction)\b[^>]*\bname="(?:[\w]+:)?(FeeTableTotalOfferingAmount|FeeTblTotOfferingAmt|TotOfferingAmt|TotOfferingAggtAmt|TotMaxAggtOfferingPrice|FnlMaxAggtOfferingPrice|TotalOfferingAmt|TotalOfferingPrice)"[^>]*>([^<]+)/gi;

export function parseUsdToken(raw: string): number | null {
  const t = raw.replace(/[$,\s]/g, "").replace(/[()]/g, "");
  if (!t || t === "—" || t === "-" || /^n\.?a\.?$/i.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export type IssuerType = "DOMESTIC" | "FOREIGN";

export function isWksiAsrForm(form: string, issuerType: IssuerType): boolean {
  const u = form.trim().toUpperCase();
  if (issuerType === "FOREIGN") return u === "F-3ASR";
  return u === "S-3ASR";
}

/** Sized registration (not WKSI ASR) allowed for this issuer type. */
export function isSizedRegistrationForm(form: string, issuerType: IssuerType): boolean {
  const u = form.trim().toUpperCase();
  if (u === "POS AM" || u.startsWith("POS AM")) return true;
  if (isWksiAsrForm(u, issuerType)) return false;
  if (issuerType === "FOREIGN") return /^(F-1|F-3)(\/|[A-Z]|$)/.test(u);
  return /^(S-1|S-3)(\/|[A-Z]|$)/.test(u);
}

export function isRegistrationFormType(form: string): boolean {
  const u = form.trim().toUpperCase();
  if (u === "POS AM" || u.startsWith("POS AM")) return true;
  return /^(S-1|S-3|F-1|F-3)([A-Z]|\/|$)/.test(u);
}

export function normalizeRegistrationFormType(form: string): string {
  const u = form.trim().toUpperCase();
  if (u.startsWith("POS AM")) return "POS AM";
  if (u === "S-3ASR" || u === "F-3ASR") return u;
  const m = /^(S-1|S-3|F-1|F-3)/.exec(u);
  return m?.[1] ?? u;
}

/** CURRENT_DATE <= effect_date + 3 years (calendar, leap-day clamped). */
export function isActiveEffectDate(isoDate: string, nowMs = Date.now()): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const lastDay = new Date(Date.UTC(y + 3, mo, 0)).getUTCDate();
  const expiryUtc = Date.UTC(y + 3, mo - 1, Math.min(day, lastDay));
  const now = new Date(nowMs);
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return todayUtc <= expiryUtc;
}

function isFeeTagName(name: string): boolean {
  return /fee/i.test(name) && !/offering/i.test(name);
}

function isTotalRowLabel(label: string): boolean {
  const t = label.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (/^totals?$/.test(t)) return true;
  if (/^totals?\b/.test(t)) return true;
  if (/total offering(?: price| amount)?/.test(t)) return true;
  if (/fee table total offering amount/.test(t)) return true;
  return false;
}

/** Exhibit 107 XBRL: only the single total offering amount tag. Never line items. */
function parseXbrlTotalOfferingAmount(xml: string): number | null {
  const amounts: number[] = [];
  const push = (tag: string, raw: string) => {
    if (isFeeTagName(tag)) return;
    const n = parseUsdToken(raw);
    if (n == null || n <= 0) return;
    amounts.push(n);
  };

  let m: RegExpExecArray | null;
  const named = new RegExp(XBRL_TOTAL_TAG_RE.source, XBRL_TOTAL_TAG_RE.flags);
  while ((m = named.exec(xml))) push(m[1] ?? "", m[2] ?? "");
  const ix = new RegExp(IX_TOTAL_TAG_RE.source, IX_TOTAL_TAG_RE.flags);
  while ((m = ix.exec(xml))) push(m[1] ?? "", m[2] ?? "");

  if (!amounts.length) return null;
  const first = amounts[0]!;
  if (amounts.every((n) => n === first)) return first;
  return null;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Exhibit 107 HTML: Total / Totals row in the Maximum Aggregate Offering Price column only. */
function parseTableTotalAmount(html: string): number | null {
  const lower = html.toLowerCase();
  if (
    !/proposed maximum aggregate offering price|calculation of registration fee|amount to be registered|maximum aggregate offering price/i.test(
      lower
    )
  ) {
    return null;
  }

  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  let lastTotal: number | null = null;

  for (const table of tables) {
    const header = stripTags(table.slice(0, 2000)).toLowerCase();
    const hasAgg = /proposed maximum aggregate offering price|aggregate offering price|maximum aggregate offering price/.test(
      header
    );
    if (!hasAgg && !/registration fee/.test(header)) continue;

    const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
    if (rows.length < 2) continue;

    const headerCells = (rows[0] ?? "").match(/<t[hd][\s\S]*?<\/t[hd]>/gi) ?? [];
    const labels = headerCells.map((c) => stripTags(c).toLowerCase());
    let col = labels.findIndex((l) =>
      /proposed maximum aggregate offering price|maximum aggregate offering price|aggregate offering price/.test(l)
    );
    if (col < 0) col = labels.findIndex((l) => /total offering/.test(l));
    if (col < 0) continue;

    for (let i = 1; i < rows.length; i++) {
      const cells = (rows[i] ?? "").match(/<t[hd][\s\S]*?<\/t[hd]>/gi) ?? [];
      const texts = cells.map((c) => stripTags(c));
      const rowLabel = texts[0] ?? "";
      if (!isTotalRowLabel(rowLabel)) continue;
      const raw = texts[col] ?? "";
      const n = parseUsdToken(raw);
      if (n != null && n > 0) lastTotal = n;
    }
  }
  return lastTotal;
}

export function parseCoverOfferingAmount(text: string): number | null {
  const head = text.slice(0, 8000);
  for (const reSrc of COVER_AMOUNT_RES) {
    const re = new RegExp(reSrc.source, reSrc.flags);
    const m = re.exec(head);
    if (!m?.[1]) continue;
    const after = head.slice(m.index + m[0].length, m.index + m[0].length + 48);
    if (/\bper\s+share\b/i.test(after)) continue;
    const n = parseUsdToken(m[1]);
    if (n != null && n > 0) return n;
  }
  return null;
}

/**
 * Single shelf cap only:
 * 1) Cover "Up to $…" / aggregate offering price
 * 2) Exhibit 107 Total cell (XBRL total tag or HTML Total row)
 * Never sum line items. Never Math.max of class amounts.
 */
export function parseOfferingAmountFromDocuments(input: {
  feeXmlOrHtml?: string | null;
  primaryHtml?: string | null;
}): OfferingParseHit | null {
  const primary = input.primaryHtml ?? "";
  if (primary.length > 40) {
    const cover = parseCoverOfferingAmount(stripTags(primary));
    if (cover != null) return { amount: cover, method: "cover_regex" };
  }

  const fee = input.feeXmlOrHtml ?? "";
  if (fee.length > 40) {
    const xbrl = parseXbrlTotalOfferingAmount(fee);
    if (xbrl != null) return { amount: xbrl, method: "fee_xbrl" };
    const table = parseTableTotalAmount(fee);
    if (table != null) return { amount: table, method: "fee_table" };
  }

  if (primary.length > 40) {
    const table = parseTableTotalAmount(primary);
    if (table != null) return { amount: table, method: "fee_table" };
  }

  return null;
}

export function parseEffectXml(xml: string): {
  form: string | null;
  fileNumber: string | null;
  effectDate: string | null;
} {
  const form = /<form>\s*([^<]+)\s*<\/form>/i.exec(xml)?.[1]?.trim() ?? null;
  const fileNumber =
    /<fileNumber>\s*([^<]+)\s*<\/fileNumber>/i.exec(xml)?.[1]?.trim() ?? null;
  const effectDate =
    /<finalEffectivenessDispDate>\s*([^<]+)\s*<\/finalEffectivenessDispDate>/i.exec(xml)?.[1]?.trim() ??
    null;
  return { form, fileNumber, effectDate };
}
