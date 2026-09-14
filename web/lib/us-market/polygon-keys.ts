export class PolygonRateLimitError extends Error {
  readonly status = 429 as const;
  constructor() {
    super("Polygon HTTP 429");
    this.name = "PolygonRateLimitError";
  }
}

export type PolygonFetchOpts = {
  haltOn429?: boolean;
  signal?: AbortSignal;
};

export function isPolygonHaltError(error: unknown): boolean {
  if (error instanceof PolygonRateLimitError) return true;
  return error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message));
}

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function polygonStarterKeyOrNull(): string | null {
  const key = readEnv("POLYGON_API_KEY_STARTER") || readEnv("POLYGON_API_KEY");
  return key || null;
}

export function polygonStarterKey(): string {
  const key = polygonStarterKeyOrNull();
  if (!key) throw new Error("POLYGON_API_KEY_STARTER is missing");
  return key;
}

export function polygonAdvancedKey(): string {
  const key = readEnv("POLYGON_API_KEY_ADVANCED");
  if (!key) throw new Error("POLYGON_API_KEY_ADVANCED is missing");
  return key;
}

export async function polygonGetWithKey(
  path: string,
  key: string,
  opts?: PolygonFetchOpts
): Promise<unknown> {
  let last = new Error("Polygon request failed");
  for (let attempt = 0; attempt < 8; attempt++) {
    if (opts?.signal?.aborted) throw new PolygonRateLimitError();
    try {
      const res = await fetch(`https://api.polygon.io${path}`, {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
        signal: opts?.signal,
      });
      const text = await res.text();
      if (res.status === 429) {
        if (opts?.haltOn429) throw new PolygonRateLimitError();
        last = new Error("Polygon HTTP 429");
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
      if (res.status >= 500) {
        last = new Error(`Polygon HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
      if (!res.ok) {
        throw new Error(`Polygon HTTP ${res.status}`);
      }
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new Error("Polygon returned non-JSON");
      }
    } catch (e) {
      if (isPolygonHaltError(e)) throw e;
      last = e instanceof Error ? e : new Error(String(e));
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw last;
}
