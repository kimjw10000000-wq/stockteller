/**
 * Local / CI batch:
 *   npx tsx scripts/sync-us-listed-companies.ts
 *   npx tsx scripts/sync-us-listed-companies.ts --market-cap-batch=2000
 *   npx tsx scripts/sync-us-listed-companies.ts --skip-market-cap --newswire-batch=20
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
