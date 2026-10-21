/**
 * 최신 SEC company_tickers_exchange.json 으로 이름, CIK, 티커, 거래소를 맞춘다.
 * ETF와 시험 종목은 거래소 목록의 Y 칸으로 빼고 넣지 않는다.
 *
 *   npm run sync:sec-tickers
 */
import { config } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "../lib/supabase/admin";
import { syncListedFromSecTickerFile } from "../lib/companies/sync-us-listed";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const admin = createAdminClient();
  const result = await syncListedFromSecTickerFile(admin);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
