/**
 * Check operator keys without printing them.
 *   npx tsx scripts/verify-operator-keys.ts
 */
import { resolve } from "node:path";
import { config } from "dotenv";
import { createAdminClient } from "../lib/supabase/admin";
import {
  polygonAdvancedKeyOrNull,
  polygonGetWithKey,
  polygonStarterKeyOrNull,
} from "../lib/us-market/polygon-keys";
import { isTossConfigured } from "../lib/toss/client";
import { fetchTossMarketCalendar } from "../lib/toss/stocks";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

function present(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function failMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

async function main(): Promise<void> {
  const names = [
    "TOSSINVEST_CLIENT_ID",
    "TOSSINVEST_CLIENT_SECRET",
    "POLYGON_API_KEY_ADVANCED",
    "POLYGON_API_KEY",
    "POLYGON_API_KEY_STARTER",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ] as const;
  const shown: Record<string, boolean> = {};
  for (const name of names) shown[name] = present(name);
  console.log("present", JSON.stringify(shown));

  const results: Record<string, string> = {};

  try {
    if (!present("NEXT_PUBLIC_SUPABASE_URL") || !present("SUPABASE_SERVICE_ROLE_KEY")) {
      throw new Error("missing");
    }
    const admin = createAdminClient();
    const { error } = await admin.from("washout_index_samples").select("t").limit(1);
    if (error) throw error;
    const tracked = await admin.from("washout_tracked_tickers").select("ticker").limit(1);
    const highs = await admin.from("washout_tape_highs").select("ticker").limit(1);
    results.supabase = "ok";
    results.washout_tracked_tickers = tracked.error ? tracked.error.message : "ok";
    results.washout_tape_highs = highs.error ? highs.error.message : "ok";
  } catch (e) {
    results.supabase = failMessage(e);
  }

  try {
    const key = polygonAdvancedKeyOrNull() || polygonStarterKeyOrNull();
    if (!key) throw new Error("missing");
    await polygonGetWithKey("/v1/marketstatus/now", key);
    results.polygon = polygonAdvancedKeyOrNull() ? "ok (advanced)" : "ok (starter)";
  } catch (e) {
    results.polygon = failMessage(e);
  }

  try {
    if (!isTossConfigured()) throw new Error("missing");
    const cal = await fetchTossMarketCalendar("US");
    results.toss = cal.country === "US" ? "ok" : "unexpected calendar";
  } catch (e) {
    results.toss = failMessage(e);
  }

  console.log("results", JSON.stringify(results));
  const hard = ["supabase", "polygon", "toss"] as const;
  if (hard.some((name) => !results[name]?.startsWith("ok"))) process.exit(1);
}

main().catch((e) => {
  console.error(failMessage(e));
  process.exit(1);
});
