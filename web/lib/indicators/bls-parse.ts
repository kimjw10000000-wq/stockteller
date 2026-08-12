import type { IndicatorId } from "./types";

export type BlsParseResult = {
  ok: true;
  actual: number;
  period: "mom" | "yoy" | "unknown";
  message: string;
} | {
  ok: false;
  reason: string;
};

/**
 * Extract headline percent from BLS CPI/PPI news release HTML.
 * Prefers seasonally adjusted monthly change, then 12-month change.
 */
export function parseBlsReleaseHtml(html: string, indicator: IndicatorId): BlsParseResult {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length < 40) {
    return { ok: false, reason: "html_too_short" };
  }

  // Avoid treating "scheduled to be released" / embargo pages as data
  if (/not yet available|embargoed|scheduled for release/i.test(text) && !/increased|decreased|unchanged/i.test(text)) {
    return { ok: false, reason: "not_released_yet" };
  }

  const momRes =
    indicator === "CPI"
      ? text.match(
          /Consumer Price Index for All Urban Consumers \(CPI-U\)\s+(increased|decreased|unchanged)(?:\s+by)?\s*([0-9]+(?:\.[0-9]+)?)\s*percent/i
        ) ||
        text.match(
          /(?:All items|CPI-U)[^\.]{0,80}?(increased|decreased|unchanged)(?:\s+by)?\s*([0-9]+(?:\.[0-9]+)?)\s*percent(?:[^\.]{0,40}?seasonally adjusted)?/i
        )
      : text.match(
          /Producer Price Index[^\.]{0,60}?(increased|decreased|unchanged)(?:\s+by)?\s*([0-9]+(?:\.[0-9]+)?)\s*percent/i
        ) ||
        text.match(
          /final demand[^\.]{0,60}?(increased|decreased|unchanged)(?:\s+by)?\s*([0-9]+(?:\.[0-9]+)?)\s*percent/i
        );

  if (momRes) {
    const direction = momRes[1].toLowerCase();
    const value = Number(momRes[2]);
    if (!Number.isFinite(value)) return { ok: false, reason: "bad_mom_number" };
    const signed = direction.startsWith("decreas") ? -Math.abs(value) : Math.abs(value);
    const actual = direction === "unchanged" ? 0 : signed;
    return {
      ok: true,
      actual,
      period: "mom",
      message: momRes[0].slice(0, 180),
    };
  }

  const yoy =
    text.match(
      /(increased|decreased|unchanged)(?:\s+by)?\s*([0-9]+(?:\.[0-9]+)?)\s*percent\s+over the (?:last|past) 12 months/i
    ) ||
    text.match(
      /12[- ]month[^\.]{0,40}?(increased|decreased|unchanged)(?:\s+by)?\s*([0-9]+(?:\.[0-9]+)?)\s*percent/i
    );

  if (yoy) {
    const direction = yoy[1].toLowerCase();
    const value = Number(yoy[2]);
    if (!Number.isFinite(value)) return { ok: false, reason: "bad_yoy_number" };
    const signed = direction.startsWith("decreas") ? -Math.abs(value) : Math.abs(value);
    const actual = direction === "unchanged" ? 0 : signed;
    return {
      ok: true,
      actual,
      period: "yoy",
      message: yoy[0].slice(0, 180),
    };
  }

  return { ok: false, reason: "pattern_not_found" };
}
