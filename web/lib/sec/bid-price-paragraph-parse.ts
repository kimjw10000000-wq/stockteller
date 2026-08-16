/**
 * Isolate $1.00 bid-price deficiency paragraphs so other Item 3.01
 * violations (equity, audit committee, etc.) do not leak dates.
 */

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December|" +
  "Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";

const DATE_TOKEN = String.raw`(?:(?:${MONTHS})\.?\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{4})`;

const US_BID_RE =
  /5550\s*\(\s*a\s*\)\s*\(\s*2\s*\)|\$1\.00\b|minimum\s+bid\s+price/i;

const FOREIGN_LISTING_RE =
  /nasdaq|listing\s+requirements|listing\s+rule|deficiency|rule\s*5550|staff\s+determination|listing\s+qualifications/i;

const FOREIGN_PRICE_RE = /\$1\.00\b|bid\s+price|minimum\s+bid/i;

/** 6-K submissions / FilingSummary title filter (skip ordinary press releases). */
export const SIXK_META_FILTER_RE =
  /nasdaq|deficiency|compliance|listing\s+requirements|bid\s+price|\$1\.00|notice|rule\s*5550/i;

export type BidPriceEventKind = "deadline" | "notice";

export type BidPriceDateExtract = {
  noticeDate: string | null;
  deadlineDate: string | null;
  /** deadline if present, else notice */
  storedDate: string | null;
  storedKind: BidPriceEventKind | null;
  excerpt: string | null;
};

const MONTH_INDEX: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

export function htmlToPlainWithBreaks(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|tr|h[1-6]|li|blockquote|table|section)>/gi, "\n\n")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t]+/g, " ").replace(/\n/g, " ").trim())
    .filter((p) => p.length >= 12);
}

export function extractItem301Section(plainText: string): string | null {
  if (!plainText) return null;
  const start = plainText.search(/Item\s*3\.01\b/i);
  if (start < 0) return null;
  const rest = plainText.slice(start);
  const next = rest.search(/\n\s*Item\s*(?!3\.01)\d{1,2}\.\d{2}\b/i);
  return (next >= 0 ? rest.slice(0, next) : rest).trim() || null;
}

export function isUsBidPriceParagraph(paragraph: string): boolean {
  return US_BID_RE.test(paragraph);
}

export function isForeignBidPriceParagraph(paragraph: string): boolean {
  return FOREIGN_LISTING_RE.test(paragraph) && FOREIGN_PRICE_RE.test(paragraph);
}

export function sixKMetaLooksRelevant(text: string): boolean {
  return Boolean(text && SIXK_META_FILTER_RE.test(text));
}

function toIsoDate(raw: string): string | null {
  const t = raw.replace(/\./g, "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (slash) {
    return `${slash[3]}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  }
  const named = new RegExp(
    String.raw`^(${MONTHS})\.?\s+(\d{1,2}),?\s+(\d{4})$`,
    "i"
  ).exec(t);
  if (!named) return null;
  const month = MONTH_INDEX[named[1].toLowerCase().replace(/\./g, "")];
  if (!month) return null;
  const day = Number(named[2]);
  const year = Number(named[3]);
  if (day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function matchIso(re: RegExp, paragraph: string): string | null {
  const m = re.exec(paragraph);
  if (!m) return null;
  const token = m[1] ?? m[0];
  return toIsoDate(token);
}

export function extractDatesFromBidPriceParagraph(paragraph: string): BidPriceDateExtract {
  const noticeDate =
    matchIso(
      new RegExp(
        String.raw`\bOn\s+(${DATE_TOKEN})[,.]?\s+(?:the\s+)?(?:Company|Registrant)\b[\s\S]{0,120}?received`,
        "i"
      ),
      paragraph
    ) ||
    matchIso(
      new RegExp(
        String.raw`(?:received|receives)\s+(?:a\s+)?(?:notification|notice|letter|deficiency)[\s\S]{0,160}?(?:on|dated)\s+(${DATE_TOKEN})`,
        "i"
      ),
      paragraph
    ) ||
    matchIso(
      new RegExp(
        String.raw`(?:notice|letter|notification)\s+(?:dated|on)\s+(${DATE_TOKEN})`,
        "i"
      ),
      paragraph
    );

  const deadlineDate =
    matchIso(
      new RegExp(
        String.raw`(?:or\s+)?until\s+(${DATE_TOKEN})(?:\s*,)?(?:\s+to\s+regain|\s+to\s+cure|\s+to\s+demonstrate)?`,
        "i"
      ),
      paragraph
    ) ||
    matchIso(new RegExp(String.raw`on\s+or\s+before\s+(${DATE_TOKEN})`, "i"), paragraph);

  const storedDate = deadlineDate ?? noticeDate;
  const storedKind: BidPriceEventKind | null = deadlineDate
    ? "deadline"
    : noticeDate
      ? "notice"
      : null;

  return {
    noticeDate,
    deadlineDate,
    storedDate,
    storedKind,
    excerpt: paragraph.slice(0, 420),
  };
}

export function parseBidPriceDatesFromHtml(
  html: string,
  kind: "us-8k" | "foreign-6k"
): BidPriceDateExtract | null {
  const plain = htmlToPlainWithBreaks(html);
  const scoped = kind === "us-8k" ? extractItem301Section(plain) ?? "" : plain;
  if (!scoped.trim()) return null;
  const paragraphs = splitParagraphs(scoped);
  const matched =
    kind === "us-8k"
      ? paragraphs.filter(isUsBidPriceParagraph)
      : paragraphs.filter(isForeignBidPriceParagraph);
  if (matched.length === 0) return null;

  let best: BidPriceDateExtract | null = null;
  for (const p of matched) {
    const got = extractDatesFromBidPriceParagraph(p);
    if (!got.storedDate) continue;
    if (!best) {
      best = got;
      continue;
    }
    if (best.storedKind !== "deadline" && got.storedKind === "deadline") {
      best = got;
    }
  }

  if (best) return best;

  const joined = extractDatesFromBidPriceParagraph(matched.join(" "));
  if (joined.storedDate) return joined;

  return {
    noticeDate: null,
    deadlineDate: null,
    storedDate: null,
    storedKind: null,
    excerpt: matched[0]?.slice(0, 420) ?? null,
  };
}

/** Nasdaq 5550(a)(2) default 180-day cure if only a notice date exists. */
export const BID_PRICE_GRACE_DAYS = 180;

export function computeBidPriceDaysRemaining(
  storedDate: string | null,
  storedKind: BidPriceEventKind | null,
  nowMs = Date.now()
): number | null {
  if (!storedDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(storedDate);
  if (!m) return null;
  const start = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const target =
    storedKind === "notice" ? start + BID_PRICE_GRACE_DAYS * 86_400_000 : start;
  return Math.ceil((target - nowMs) / 86_400_000);
}
