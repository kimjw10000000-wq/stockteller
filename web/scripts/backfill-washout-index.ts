/**
 * 설거지 지수 1년 백필. 분봉으로 재계산하고 고점 분만 초봉.
 *
 *   npx tsx scripts/backfill-washout-index.ts --days=90 --no-resume
 */
import { resolve } from "node:path";
import { config } from "dotenv";
import { backfillWashoutIndex } from "../lib/us-market/washout-backfill";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

function argNum(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.slice(name.length + 3));
  return Number.isFinite(n) ? n : fallback;
}

async function main() {
  const resume = process.argv.includes("--no-resume") ? false : true;
  const days = argNum("days", 90);
  const concurrency = argNum("concurrency", 3);
  console.log(JSON.stringify({ days, concurrency, resume, doneHint: "skip tape_dates already in DB" }));
  const result = await backfillWashoutIndex({
    days,
    concurrency,
    resume,
    onDay: (info) => {
      if (info.skipped) return;
      console.log(
        `${info.tapeYmd} listed=${info.listed ?? "-"} grouped=${info.grouped ?? "-"} movers=${info.movers ?? "-"} names=${info.names} pts=${info.points} index=${info.index.toFixed(2)}`
      );
    },
  });
  console.log(JSON.stringify(result));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
