import bundledCities from "@/lib/sec/world-cities.json";
import type { SupabaseClient } from "@supabase/supabase-js";

let cache: Set<string> | null = null;

function bundledSet(): Set<string> {
  return new Set((bundledCities as string[]).map((n) => String(n).toUpperCase()));
}

/** GeoNames city names (uppercase ASCII). DB if seeded, else bundled JSON. */
export async function loadWorldCityNames(client?: SupabaseClient | null): Promise<Set<string>> {
  if (cache) return cache;
  if (client) {
    const { data, error } = await client.from("world_cities").select("ascii_name").limit(80_000);
    if (!error && data && data.length >= 1_000) {
      cache = new Set(
        data
          .map((row) => String(row.ascii_name ?? "").toUpperCase().trim())
          .filter((n) => n.length >= 4)
      );
      return cache;
    }
  }
  cache = bundledSet();
  return cache;
}

export function resetWorldCityCache() {
  cache = null;
}
