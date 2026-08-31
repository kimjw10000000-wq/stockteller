import { detectListedNewswire } from "@/lib/sec/listed-newswires";

/** "wire" letters — GlobeNewswire, Business Wire, PR Newswire, NEWSWIRE, … */
const WIRE_RE = /wire/i;
const PRESS_RELEASE_RE = /press[\s\-]?release/i;
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

export function hasPressRelease(text: string): boolean {
  return PRESS_RELEASE_RE.test(text || "");
}

/**
 * 6-K Exhibit 99.1 counts as News when the document contains "press release".
 * Newswire label is optional (GlobeNewswire / Business Wire / PR Newswire).
 */
export function classifyExhibit99Dateline(
  text: string,
  cities: Set<string>
): Exhibit99Classification {
  const body = text || "";
  if (!hasPressRelease(body)) {
    return { isNewswire: false, city: null, newswire: null };
  }
  const window = body.slice(0, DATELINE_CHARS);
  const wireAt = window.search(WIRE_RE);
  const city =
    wireAt >= 0 ? findCityInText(window.slice(0, wireAt), cities) : findCityInText(window, cities);
  const newswire = detectListedNewswire(body);
  return { isNewswire: true, city, newswire };
}
