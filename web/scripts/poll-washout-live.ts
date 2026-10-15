/**
 * 이 컴퓨터에서 Polygon Advanced로 설거지 지수를 계산해 Supabase에 넣는다.
 * 프리·본장·애프터, 매분 55초에 스냅샷. GitHub Actions는 쓰지 않는다.
 * 전고 돌파 카드는 같은 프로세스에서 체결만 받아 odds.json으로 올린다.
 *
 *   npm run poll:washout
 */
import { resolve } from "node:path";
import { config } from "dotenv";
import { captureWashoutLive } from "../lib/us-market/washout-live";
import { noteReclaimSeeds, startReclaimOddsFeed } from "../lib/us-market/reclaim-odds-feed";
import { compactOldWashoutSamples } from "../lib/us-market/washout-samples";
import { washoutCaptureSkipReason } from "../lib/us-market/washout-schedule";
import { polygonAdvancedKeyOrNull, polygonStarterKeyOrNull } from "../lib/us-market/polygon-keys";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

/** 스냅샷 `min.h`가 그 분 고점에 가깝게, 매분 이 초에 요청한다. */
const SNAPSHOT_AT_SECOND = 55;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function msUntilUtcSecond(sec: number): number {
  const now = Date.now();
  const elapsed = now % 60_000;
  const target = sec * 1000;
  const wait = target - elapsed;
  if (wait <= 200) return wait + 60_000;
  return wait;
}

async function sleepUntilSnapshotSecond(): Promise<void> {
  await sleep(msUntilUtcSecond(SNAPSHOT_AT_SECOND));
}

let captureBusy = false;

async function loop(): Promise<void> {
  if (!polygonAdvancedKeyOrNull() && !polygonStarterKeyOrNull()) {
    throw new Error("POLYGON_API_KEY_ADVANCED or POLYGON_API_KEY is missing in .env.local");
  }
  startReclaimOddsFeed();
  let hour = -1;
  for (;;) {
    await sleepUntilSnapshotSecond();
    const now = new Date();
    if (captureBusy) {
      console.log(now.toISOString(), "skip overlapped capture");
      continue;
    }
    captureBusy = true;
    try {
      const skip = await washoutCaptureSkipReason(now);
      if (skip === "ok") {
        const live = await captureWashoutLive();
        try {
          noteReclaimSeeds(live.items);
        } catch (e) {
          console.error("reclaim seeds", e instanceof Error ? e.message : e);
        }
        console.log(
          new Date().toISOString(),
          `tape=${live.tapeYmd} index=${live.index.toFixed(2)} names=${live.items.length} pts=${live.series.length}`
        );
      } else {
        try {
          noteReclaimSeeds([]);
        } catch (e) {
          console.error("reclaim seeds", e instanceof Error ? e.message : e);
        }
        console.log(now.toISOString(), "idle", skip);
      }
      if (hour >= 0 && now.getUTCHours() !== hour) {
        const compact = await compactOldWashoutSamples(now.getTime());
        if (compact.compacted || compact.pruned) {
          console.log(now.toISOString(), "compact", compact);
        }
      }
      hour = now.getUTCHours();
      continue;
    } catch (e) {
      console.error(now.toISOString(), e instanceof Error ? e.message : e);
      await sleep(5_000);
    } finally {
      captureBusy = false;
    }
  }
}

loop().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
