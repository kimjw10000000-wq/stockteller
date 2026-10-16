import { koreanNamesUrl } from "@/lib/us-market/washout-chart-url";

type NamesFile = { names?: Record<string, string> };

let names: Record<string, string> = {};
let loadedAt = 0;
let inflight: Promise<void> | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function listingKey(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\./g, "-");
}

export function peekKoreanShareName(ticker: string): string {
  return names[listingKey(ticker)] ?? "";
}

export function subscribeKoreanShareNames(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function ensureKoreanShareNames(): Promise<void> {
  if (loadedAt && Date.now() - loadedAt < 60_000) return Promise.resolve();
  if (inflight) return inflight;
  const url = koreanNamesUrl();
  if (!url) {
    loadedAt = Date.now();
    return Promise.resolve();
  }
  if (!refreshTimer && typeof window !== "undefined") {
    refreshTimer = setInterval(() => {
      loadedAt = 0;
      void ensureKoreanShareNames();
    }, 60_000);
  }
  inflight = fetch(url, { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) return;
      const json = (await res.json()) as NamesFile;
      if (json.names && typeof json.names === "object") names = json.names;
    })
    .catch(() => undefined)
    .finally(() => {
      loadedAt = Date.now();
      inflight = null;
      for (const listener of listeners) listener();
    });
  return inflight;
}
