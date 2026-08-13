import { unstable_cache } from "next/cache";
import { fetchBlsApiActuals, fetchBlsApiActualsMemo, type BlsApiBundle } from "./bls-api";
import { broadcastIndicator } from "./hub";
import { buildPayload, getSnapshot, setActual } from "./store";
import type { IndicatorId } from "./types";

const cachedBlsActuals = unstable_cache(
  async (): Promise<BlsApiBundle> => fetchBlsApiActuals(),
  ["bls-api-actuals-v1"],
  { revalidate: 600 }
);

async function loadBundle(): Promise<BlsApiBundle> {
  try {
    return await cachedBlsActuals();
  } catch (e) {
    console.warn("[indicators/hydrate] cache miss fallback", e);
    return fetchBlsApiActualsMemo();
  }
}

let inflight: Promise<boolean> | null = null;

function applyBundle(bundle: BlsApiBundle): boolean {
  let wrote = false;
  for (const id of ["CPI", "PPI"] as IndicatorId[]) {
    if (buildPayload(id).actual != null) continue;
    const hit = bundle[id];
    if (!hit) continue;
    setActual(id, hit.actual, {
      period: hit.period,
      message: hit.message,
      observationPeriod: hit.observationPeriod,
    });
    wrote = true;
  }
  return wrote;
}

/**
 * Fill empty in-memory actuals from the official BLS JSON API.
 * Does not require HTML scraping or a VPS.
 */
export async function hydrateLatestActuals(): Promise<boolean> {
  if (["CPI", "PPI"].every((id) => buildPayload(id as IndicatorId).actual != null)) {
    return false;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const bundle = await loadBundle();
      const wrote = applyBundle(bundle);
      if (wrote) broadcastIndicator("snapshot", getSnapshot());
      return wrote;
    } catch (e) {
      console.warn("[indicators/hydrate]", e instanceof Error ? e.message : e);
      return false;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
