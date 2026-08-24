/**
 * SEC listed-master sync (insert / ticker rename / OTC+inactive / exchange).
 *
 *   npm run sync:us-listed
 *   npm run sync:us-listed -- --skip-market-cap --skip-newswire
 *
 * Requires migration 20260824_us_listed_active_ticker_history.sql
 * Daily: Vercel Cron GET /api/cron/us-listed-sync (01:15 UTC / 10:15 KST)
 */
import { config } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "../lib/supabase/admin";
import { syncUsListedCompanies } from "../lib/companies/sync-us-listed";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

function argNum(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) ? n : fallback;
}

async function main() {
  const skipMarketCap = process.argv.includes("--skip-market-cap");
  const skipNewswire = process.argv.includes("--skip-newswire");
  const marketCapBatchSize = argNum("market-cap-batch", 2000);
  const newswireBatchSize = argNum("newswire-batch", 8);
  const admin = createAdminClient();
  const result = await syncUsListedCompanies(admin, {
    marketCapBatchSize,
    skipMarketCap,
    newswireBatchSize,
    skipNewswire,
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
