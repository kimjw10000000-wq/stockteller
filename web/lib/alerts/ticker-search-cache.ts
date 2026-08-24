import type { TickerHit } from "@/lib/alerts/types";

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { hits: TickerHit[]; at: number }>();

export function getCachedTickerHits(query: string): TickerHit[] | null {
  const key = query.trim().toLowerCase();
  if (!key) return null;
  const row = cache.get(key);
  if (!row) return null;
  if (Date.now() - row.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return row.hits;
}

export function setCachedTickerHits(query: string, hits: TickerHit[]) {
  const key = query.trim().toLowerCase();
  if (!key) return;
  cache.set(key, { hits, at: Date.now() });
}
