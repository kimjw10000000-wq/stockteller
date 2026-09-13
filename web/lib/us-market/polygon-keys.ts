function readEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function polygonStarterKey(): string {
  const key = readEnv("POLYGON_API_KEY_STARTER") || readEnv("POLYGON_API_KEY");
  if (!key) throw new Error("POLYGON_API_KEY_STARTER is missing");
  return key;
}

export function polygonAdvancedKey(): string {
  const key = readEnv("POLYGON_API_KEY_ADVANCED");
  if (!key) throw new Error("POLYGON_API_KEY_ADVANCED is missing");
  return key;
}

export async function polygonGetWithKey(path: string, key: string): Promise<unknown> {
  let last = new Error("Polygon request failed");
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const res = await fetch(`https://api.polygon.io${path}`, {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
      });
      const text = await res.text();
      if (res.status === 429 || res.status >= 500) {
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
      last = e instanceof Error ? e : new Error(String(e));
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw last;
}
