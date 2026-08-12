import type { IndicatorId } from "./types";

export type BlsParseResult =
  | {
      ok: true;
      actual: number;
      period: "mom" | "yoy" | "unknown";
      message: string;
      method: "table_a" | "first_paragraph" | "keyword_anchor";
      yoy?: number | null;
    }
  | {
      ok: false;
      reason: string;
    };

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

function parseSignedPercentToken(raw: string): number | null {
  const t = raw.trim().replace(/,/g, "");
  if (!t || t === "—" || t === "-" || t === "n.a." || /^n\.?a\.?$/i.test(t)) return null;
  if (/unchanged|^0(?:\.0+)?%?$/i.test(t)) return 0;
  const m = t.match(/^([+-]?)(\d+(?:\.\d+)?)\s*%?$/);
  if (!m) return null;
  const n = Number(m[2]);
  if (!Number.isFinite(n)) return null;
  if (m[1] === "-") return -Math.abs(n);
  return Math.abs(n) * (m[1] === "+" ? 1 : 1);
}

function directionToSigned(direction: string, value: number): number {
  const d = direction.toLowerCase();
  if (d.startsWith("unchang") || d === "flat") return 0;
  if (d.startsWith("decreas") || d.startsWith("fell") || d.startsWith("down") || d === "declined") {
    return -Math.abs(value);
  }
  return Math.abs(value);
}

function isHeadlineRowLabel(label: string, indicator: IndicatorId): boolean {
  const t = label.replace(/\s+/g, " ").trim().toLowerCase();
  if (!t) return false;
  // Exclude core / components
  if (/less food|food at home|energy|gasoline|shelter|apparel|medical|recreation|transport/i.test(t)) {
    return false;
  }
  if (indicator === "CPI") {
    return t === "all items" || t === "all items (1)" || /^all items\b/.test(t) && !/less/.test(t);
  }
  // PPI headline
  return (
    t === "final demand" ||
    t === "final demand (1)" ||
    t === "all items" ||
    (/^final demand\b/.test(t) && !/less|foods|energy|services|goods/.test(t))
  );
}

/**
 * Strategy 3 — Table A: row label "All items" / "Final demand"
 * Prefer latest seasonally-adjusted MoM cell; also capture trailing 12-mo cell when present.
 */
export function parseFromTableA(html: string, indicator: IndicatorId): BlsParseResult | null {
  // Narrow to Table A region when caption exists
  const tableAMatch = html.match(
    /Table\s+A\.[\s\S]{0,400}?(<table[\s\S]*?<\/table>)/i
  );
  const scope = tableAMatch?.[1] ?? html;

  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowHtml: RegExpExecArray | null;
  while ((rowHtml = rowRe.exec(scope))) {
    const cells = Array.from(
      rowHtml[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)
    ).map((m) => stripTags(m[1]));
    if (cells.length < 2) continue;
    const label = cells[0] ?? "";
    if (!isHeadlineRowLabel(label, indicator)) continue;

    const nums = cells
      .slice(1)
      .map(parseSignedPercentToken)
      .filter((n): n is number => n != null);
    if (!nums.length) continue;

    // Typical CPI Table A: several MoM SA cols + final Unadjusted 12-mos col
    let mom: number;
    let yoy: number | null = null;
    if (nums.length >= 2) {
      yoy = nums[nums.length - 1]!;
      mom = nums[nums.length - 2]!;
    } else {
      mom = nums[0]!;
    }

    return {
      ok: true,
      actual: mom,
      yoy,
      period: "mom",
      method: "table_a",
      message: `Table A ${label.trim()}: MoM ${mom}%${yoy != null ? `, YoY ${yoy}%` : ""}`,
    };
  }
  return null;
}

/** First content <p> that looks like the release lead paragraph. */
export function extractFirstLeadParagraph(html: string): string | null {
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const text = stripTags(m[1]);
    if (text.length < 40) continue;
    if (/skip to|javascript|browse|subscribe|release calendar/i.test(text)) continue;
    if (
      /Consumer Price Index for All Urban Consumers|CPI-U|Producer Price Index|final demand/i.test(
        text
      )
    ) {
      return text;
    }
  }
  // fallback: first long paragraph
  const again = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  while ((m = again.exec(html))) {
    const text = stripTags(m[1]);
    if (text.length >= 80 && /percent/i.test(text)) return text;
  }
  return null;
}

/**
 * Strategy 1 — parse lead paragraph only.
 */
export function parseFromFirstParagraph(html: string, indicator: IndicatorId): BlsParseResult | null {
  const p = extractFirstLeadParagraph(html);
  if (!p) return null;
  const hit = matchHeadlineSentence(p, indicator);
  if (!hit) return null;
  return { ...hit, method: "first_paragraph" };
}

/**
 * Strategy 2 — keyword-anchored regex on full text (headline only).
 * Requires All items / CPI-U / headline / final demand near the verb+percent.
 */
export function matchHeadlineSentence(
  text: string,
  indicator: IndicatorId
): Omit<Extract<BlsParseResult, { ok: true }>, "method"> | null {
  const patterns: RegExp[] =
    indicator === "CPI"
      ? [
          // CPI-U ... increased/decreased/unchanged X.X percent
          /Consumer Price Index for All Urban Consumers\s*\(CPI-U\)\s+(increased|decreased|unchanged|fell|rose|declined)(?:\s+by)?\s*([0-9]+(?:\.[0-9]+)?)\s*percent/i,
          // The index for all items ... (not "less food")
          /\b(?:the\s+)?(?:index\s+for\s+)?all items(?!\s+less)\b[^\.]{0,40}?\b(increased|decreased|unchanged|fell|rose|declined)(?:\s+by)?\s*([0-9]+(?:\.[0-9]+)?)\s*percent/i,
          // headline CPI
          /\bheadline\b[^\.]{0,40}?\b(increased|decreased|unchanged|fell|rose|declined)(?:\s+by)?\s*([0-9]+(?:\.[0-9]+)?)\s*percent/i,
          // signed form near all items / CPI-U
          /\b(?:all items(?!\s+less)|CPI-U|headline)\b[^\.]{0,50}?([+-]?\d+(?:\.\d+)?)\s*%/i,
        ]
      : [
          /Producer Price Index for final demand\s+(increased|decreased|unchanged|fell|rose|declined)(?:\s+by)?\s*([0-9]+(?:\.[0-9]+)?)\s*percent/i,
          /\bfinal demand(?!\s+less|\s+goods|\s+services)\b[^\.]{0,50}?\b(increased|decreased|unchanged|fell|rose|declined)(?:\s+by)?\s*([0-9]+(?:\.[0-9]+)?)\s*percent/i,
          /\b(?:all items(?!\s+less)|headline)\b[^\.]{0,40}?\b(increased|decreased|unchanged|fell|rose|declined)(?:\s+by)?\s*([0-9]+(?:\.[0-9]+)?)\s*percent/i,
          /\b(?:final demand|all items(?!\s+less)|headline)\b[^\.]{0,50}?([+-]?\d+(?:\.\d+)?)\s*%/i,
        ];

  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;

    // Verb+number patterns
    if (m[2] != null && /increased|decreased|unchanged|fell|rose|declined/i.test(m[1])) {
      const value = Number(m[2]);
      if (!Number.isFinite(value)) continue;
      const actual = directionToSigned(m[1], value);
      const period: "mom" | "yoy" | "unknown" = /12 months|over the year|year.?over/i.test(m[0])
        ? "yoy"
        : "mom";
      return {
        ok: true,
        actual,
        period,
        message: m[0].slice(0, 200),
      };
    }

    // Signed percent only
    if (m[1] && m[2] == null) {
      const actual = parseSignedPercentToken(m[1]);
      if (actual == null) continue;
      return {
        ok: true,
        actual,
        period: "mom",
        message: m[0].slice(0, 200),
      };
    }
  }

  // YoY headline anchored (only if MoM not found by caller)
  const yoyRe =
    indicator === "CPI"
      ? /(?:all items(?!\s+less)|CPI-U|headline)[^\.]{0,80}?(increased|decreased|unchanged|rose|fell)(?:\s+by)?\s*([0-9]+(?:\.[0-9]+)?)\s*percent\s+over the (?:last|past) 12 months/i
      : /(?:final demand|all items(?!\s+less)|headline)[^\.]{0,80}?(increased|decreased|unchanged|rose|fell)(?:\s+by)?\s*([0-9]+(?:\.[0-9]+)?)\s*percent\s+over the (?:last|past) 12 months/i;
  const y = text.match(yoyRe);
  if (y) {
    const value = Number(y[2]);
    if (Number.isFinite(value)) {
      return {
        ok: true,
        actual: directionToSigned(y[1], value),
        period: "yoy",
        message: y[0].slice(0, 200),
      };
    }
  }

  return null;
}

export function parseFromKeywordAnchor(html: string, indicator: IndicatorId): BlsParseResult | null {
  const text = stripTags(html);
  if (text.length < 40) return null;
  const hit = matchHeadlineSentence(text, indicator);
  if (!hit) return null;
  return { ...hit, method: "keyword_anchor" };
}

/**
 * Extract headline CPI/PPI All-items (or Final demand) percent.
 * Tries Table A → first paragraph → keyword-anchored full-text regex.
 */
export function parseBlsReleaseHtml(html: string, indicator: IndicatorId): BlsParseResult {
  if (!html || html.length < 40) {
    return { ok: false, reason: "html_too_short" };
  }

  const lowered = html.toLowerCase();
  if (
    /access denied|bot activity|robots/i.test(html) &&
    !/consumer price index|producer price index/i.test(html)
  ) {
    return { ok: false, reason: "access_denied" };
  }
  if (
    /not yet available|embargoed|scheduled for release/i.test(lowered) &&
    !/increased|decreased|unchanged|fell|rose/i.test(lowered)
  ) {
    return { ok: false, reason: "not_released_yet" };
  }

  const fromTable = parseFromTableA(html, indicator);
  if (fromTable?.ok) return fromTable;

  const fromPara = parseFromFirstParagraph(html, indicator);
  if (fromPara?.ok) return fromPara;

  const fromAnchor = parseFromKeywordAnchor(html, indicator);
  if (fromAnchor?.ok) return fromAnchor;

  return { ok: false, reason: "pattern_not_found" };
}
