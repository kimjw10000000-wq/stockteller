/**
 * Upsert bundled GeoNames city names into public.world_cities.
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import cities from "../lib/sec/world-cities.json";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const names = (cities as string[]).map((n) => String(n).trim()).filter((n) => n.length >= 4);
  const chunk = 500;
  let upserted = 0;
  for (let i = 0; i < names.length; i += chunk) {
    const rows = names.slice(i, i + chunk).map((ascii_name) => ({ ascii_name, name: ascii_name }));
    const { error } = await client.from("world_cities").upsert(rows, { onConflict: "ascii_name" });
    if (error) throw new Error(error.message);
    upserted += rows.length;
    console.log(`upserted ${upserted}/${names.length}`);
  }
  console.log(`done, ${upserted} cities`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
