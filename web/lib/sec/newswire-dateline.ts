import { detectPrimaryNewswire } from "@/lib/companies/newswire";

/** "wire" letters — GlobeNewswire, Business Wire, PR Newswire, NEWSWIRE, … */
const WIRE_RE = /wire/i;
const DATELINE_CHARS = 2_000;

export type Exhibit99Classification = {
  isNewswire: boolean;
  city: string | null;
  newswire: string | null;
};

function tokenize(raw: string): string[] {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function findCityInText(text: string, cities: Set<string>): string | null {
  const words = tokenize(text);
  let best: string | null = null;
  for (let i = 0; i < words.length; i++) {
    for (let n = 4; n >= 1; n--) {
      if (i + n > words.length) continue;
      const cand = words.slice(i, i + n).join(" ");
      if (cand.length < 4) continue;
      if (!cities.has(cand)) continue;
      if (!best || cand.length > best.length) best = cand;
    }
  }
  return best;
}

function extractWireParen(text: string): string | null {
  const m = /\(([^)]{0,80}wire[^)]{0,40})\)/i.exec(text);
  const inner = m?.[1]?.replace(/\s+/g, " ").trim();
  return inner || null;
}

/**
 * Press-release dateline: a world city AND the word "wire"
 * (GlobeNewswire, Business Wire, PR Newswire, …) in the opening of Exhibit 99.1.
 */
export function classifyExhibit99Dateline(
  text: string,
  cities: Set<string>
): Exhibit99Classification {
  const window = (text || "").slice(0, DATELINE_CHARS);
  const wireAt = window.search(WIRE_RE);
  if (wireAt < 0) {
    return { isNewswire: false, city: null, newswire: null };
  }
  const prefix = window.slice(0, wireAt);
  const city = findCityInText(prefix, cities);
  if (!city) {
    return { isNewswire: false, city: null, newswire: null };
  }
  const labeled =
    detectPrimaryNewswire(window) || extractWireParen(window) || "Wire";
  return { isNewswire: true, city, newswire: labeled };
}
