/**
 * 로컬/VPS: Polygon Advanced로 설거지 지수를 계산해 Supabase에 넣는다.
 * whyup.net(Vercel)은 DB만 읽으므로 키를 Vercel에 넣지 않는다.
 *
 *   npm run poll:washout
 */
import { resolve } from "node:path";
import { config } from "dotenv";
import { captureWashoutLive } from "../lib/us-market/washout-live";
import { compactOldWashoutSamples } from "../lib/us-market/washout-samples";
import { washoutCaptureSkipReason } from "../lib/us-market/washout-schedule";
import { polygonAdvancedKeyOrNull, polygonStarterKeyOrNull } from "../lib/us-market/polygon-keys";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pollMs(reason: Awaited<ReturnType<typeof washoutCaptureSkipReason>>): number {
  return reason === "ok" ? 3_000 : 60_000;
}

async function loop(): Promise<void> {
  if (!polygonAdvancedKeyOrNull() && !polygonStarterKeyOrNull()) {
    throw new Error("POLYGON_API_KEY_ADVANCED or POLYGON_API_KEY is missing in .env.local");
  }
  let hour = -1;
  for (;;) {
    const now = new Date();
    try {
      const skip = process.argv.includes("--ignore-schedule")
        ? ("ok" as const)
        : await washoutCaptureSkipReason(now);
      if (skip === "ok") {
        const live = await captureWashoutLive();
        console.log(
          now.toISOString(),
          `tape=${live.tapeYmd} index=${live.index.toFixed(2)} names=${live.items.length} pts=${live.series.length}`
        );
      } else {
        console.log(now.toISOString(), "idle", skip);
      }
      if (hour >= 0 && now.getUTCHours() !== hour) {
        const compact = await compactOldWashoutSamples(now.getTime());
        if (compact.compacted || compact.pruned) {
          console.log(now.toISOString(), "compact", compact);
        }
      }
      hour = now.getUTCHours();
      await sleep(pollMs(skip));
      continue;
    } catch (e) {
      console.error(now.toISOString(), e instanceof Error ? e.message : e);
    }
    await sleep(60_000);
  }
}

loop().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
