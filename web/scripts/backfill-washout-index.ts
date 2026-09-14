/**
 * 설거지 지수 백필. 분봉으로 재계산하고 고점 분만 초봉.
 * 날짜는 순차, 종목만 병렬. 429면 즉시 중단. 재개 시 추적 종목을 비우지 않음.
 *
 *   npx tsx scripts/backfill-washout-index.ts --days=90 --concurrency=8
 *   npx tsx scripts/backfill-washout-index.ts --until-live
 */
import { resolve } from "node:path";
import { config } from "dotenv";
import { backfillWashoutIndex } from "../lib/us-market/washout-backfill";
import { getWashoutBoard } from "../lib/us-market/washout-live";
import { isPolygonHaltError } from "../lib/us-market/polygon-keys";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

function argNum(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.slice(name.length + 3));
  return Number.isFinite(n) ? n : fallback;
}

async function main() {
  const untilLive = process.argv.includes("--until-live");
  const resume = process.argv.includes("--no-resume") ? false : true;
  const days = argNum("days", 90);
  const concurrency = argNum("concurrency", 8);
  console.log(
    JSON.stringify({
      days,
      concurrency,
      resume,
      untilLive,
      haltOn429: true,
      polygon: untilLive ? "starter catch-up then advanced live" : "starter backfill",
    })
  );
  const result = await backfillWashoutIndex({
    days,
    concurrency,
    resume,
    untilLive,
    onDay: (info) => {
      if (info.skipped) return;
      const replay = info.replay ? " replay" : "";
      console.log(
        `${info.tapeYmd} listed=${info.listed ?? "-"} grouped=${info.grouped ?? "-"} movers=${info.movers ?? "-"} names=${info.names} pts=${info.points} index=${info.index.toFixed(2)}${replay}`
      );
    },
  });
  console.log(JSON.stringify(result));
  if (untilLive) {
    const board = await getWashoutBoard({ force: true, range: "1d" });
    console.log(
      JSON.stringify({
        liveHandoff: true,
        tapeYmd: board.sessionDate,
        index: Number(board.index.toFixed(2)),
        names: board.items.length,
        points: board.series.length,
      })
    );
  }
}

main().catch((e) => {
  if (isPolygonHaltError(e)) {
    console.error("HALT Polygon 429 — backfill stopped. Tracking cursor kept at last complete day.");
    process.exit(2);
  }
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
