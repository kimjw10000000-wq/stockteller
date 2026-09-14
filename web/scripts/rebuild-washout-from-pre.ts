/**
 * 오늘 테이프의 프리마켓 이후 샘플을 지우고, 분봉으로 다시 넣는다.
 *   npx tsx scripts/rebuild-washout-from-pre.ts
 */
import { resolve } from "node:path";
import { config } from "dotenv";
import { captureWashoutLive } from "../lib/us-market/washout-live";
import { deleteSamplesFromTape } from "../lib/us-market/washout-samples";
import { etPremarketStartMs, runnerTapeDate } from "../lib/us-market/us-session";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function main(): Promise<void> {
  const tapeYmd = runnerTapeDate(new Date());
  const fromMs = etPremarketStartMs(tapeYmd);
  const deleted = await deleteSamplesFromTape(tapeYmd, fromMs);
  const live = await captureWashoutLive({ persistAll: true, persistFromMs: fromMs });
  console.log(
    JSON.stringify({
      tapeYmd,
      from: new Date(fromMs).toISOString(),
      deleted,
      index: Number(live.index.toFixed(2)),
      names: live.items.length,
      points: live.series.filter((p) => p.t >= fromMs).length,
    })
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
