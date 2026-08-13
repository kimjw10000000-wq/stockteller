import { fetchBlsApiActualsMemo } from "./bls-api";
import { parseBlsReleaseHtml } from "./bls-parse";
import { broadcastIndicator } from "./hub";
import {
  buildPayload,
  getNextReleaseAt,
  getSnapshot,
  isScraping,
  setActual,
  setScraping,
} from "./store";
import { BLS_URLS, type IndicatorId } from "./types";

const DEFAULT_UA =
  process.env.BLS_USER_AGENT?.trim() ||
  process.env.SEC_USER_AGENT?.trim() ||
  "WhyupIndicators/1.0 (whyup.net; indicators@whyup.net)";

const POLL_MS = Math.min(
  Math.max(Number(process.env.INDICATOR_POLL_MS || 400) || 400, 200),
  2000
);

type ScrapeLoop = {
  stop: boolean;
  promise: Promise<void>;
};

const loops: Partial<Record<IndicatorId, ScrapeLoop>> = {};

async function fetchBlsHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": DEFAULT_UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`BLS HTTP ${res.status}`);
  }
  return res.text();
}

function publish(id: IndicatorId) {
  const payload = buildPayload(id);
  broadcastIndicator("indicator", payload);
  broadcastIndicator("snapshot", getSnapshot());
}

export async function applyParsedActual(
  id: IndicatorId,
  actual: number,
  meta?: { period?: "mom" | "yoy" | "unknown"; message?: string; observationPeriod?: string }
) {
  setActual(id, actual, meta);
  publish(id);
}

function isNearScheduledRelease(id: IndicatorId): boolean {
  const iso = getNextReleaseAt(id);
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  const delta = Date.now() - t;
  return delta >= -15_000 && delta <= 180_000;
}

async function applyFromOfficialApi(id: IndicatorId): Promise<boolean> {
  const bundle = await fetchBlsApiActualsMemo();
  const hit = bundle[id];
  if (!hit) return false;
  await applyParsedActual(id, hit.actual, {
    period: hit.period,
    message: `[bls_api] ${hit.message}`,
    observationPeriod: hit.observationPeriod,
  });
  return true;
}

/**
 * Poll BLS HTML until parse succeeds or timeout.
 * Single-flight per indicator per process.
 */
export function startIndicatorScrapeWindow(
  id: IndicatorId,
  options?: { durationMs?: number; force?: boolean }
): { started: boolean; reason?: string } {
  if (loops[id] && !options?.force) {
    return { started: false, reason: "already_running" };
  }

  const durationMs = Math.min(
    Math.max(options?.durationMs ?? 120_000, 10_000),
    280_000
  );

  const loop: ScrapeLoop = { stop: false, promise: Promise.resolve() };
  loops[id] = loop;
  setScraping(id, true);
  broadcastIndicator("scraping", { indicator: id, scraping: true });

  loop.promise = (async () => {
    const url = BLS_URLS[id];
    const deadline = Date.now() + durationMs;
    let lastReason = "";
    const liveWindow = isNearScheduledRelease(id);

    // After the print (or when no schedule is set), official JSON API is enough.
    // Vercel datacenter IPs are often blocked on www.bls.gov HTML.
    if (!liveWindow) {
      try {
        if (await applyFromOfficialApi(id)) {
          setScraping(id, false);
          broadcastIndicator("scraping", { indicator: id, scraping: false, lastReason: null });
          broadcastIndicator("snapshot", getSnapshot());
          delete loops[id];
          return;
        }
      } catch (e) {
        lastReason = e instanceof Error ? e.message : String(e);
        console.warn("[indicators/scrape] api", id, lastReason);
      }
    }

    while (!loop.stop && Date.now() < deadline) {
      try {
        const html = await fetchBlsHtml(url);
        const parsed = parseBlsReleaseHtml(html, id);
        if (parsed.ok) {
          await applyParsedActual(id, parsed.actual, {
            period: parsed.period,
            message: `[${parsed.method}] ${parsed.message}`,
          });
          console.info(
            "[indicators/scrape] parsed",
            id,
            parsed.actual,
            parsed.period,
            parsed.method
          );
          lastReason = "";
          break;
        }
        lastReason = parsed.reason;
        if (parsed.reason === "access_denied") {
          if (await applyFromOfficialApi(id)) {
            lastReason = "";
            break;
          }
          break;
        }
      } catch (e) {
        lastReason = e instanceof Error ? e.message : String(e);
        console.warn("[indicators/scrape]", id, lastReason);
        if (/BLS HTTP 403|BLS HTTP 429/.test(lastReason)) {
          try {
            if (await applyFromOfficialApi(id)) {
              lastReason = "";
              break;
            }
          } catch {
            /* keep html error */
          }
          if (!liveWindow) break;
        }
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }

    if (buildPayload(id).actual == null) {
      try {
        if (await applyFromOfficialApi(id)) lastReason = "";
      } catch (e) {
        lastReason = e instanceof Error ? e.message : lastReason;
      }
    }

    setScraping(id, false);
    broadcastIndicator("scraping", {
      indicator: id,
      scraping: false,
      lastReason: lastReason || null,
    });
    broadcastIndicator("snapshot", getSnapshot());
    delete loops[id];
  })();

  return { started: true };
}

export function stopIndicatorScrape(id: IndicatorId) {
  const loop = loops[id];
  if (loop) loop.stop = true;
  setScraping(id, false);
}

export function scrapeStatus(id: IndicatorId) {
  return { scraping: isScraping(id), pollMs: POLL_MS };
}
