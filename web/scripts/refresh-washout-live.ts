/**
 * Seed live dump-index tracking from the backfill cursor, then refresh with Advanced.
 *
 *   npx tsx scripts/refresh-washout-live.ts
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "dotenv";
import { persistTrackedTickers } from "../lib/us-market/washout-samples";
import { getWashoutBoard } from "../lib/us-market/washout-live";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const raw = JSON.parse(await readFile(resolve(process.cwd(), ".washout-backfill-cursor.json"), "utf8")) as {
    lastTape?: string;
    tickers?: string[];
  };
  const tickers = (raw.tickers ?? []).map((t) => t.trim().toUpperCase()).filter(Boolean);
  await persistTrackedTickers(tickers);
  console.log(JSON.stringify({ seeded: tickers.length, lastTape: raw.lastTape ?? null }));
  const board = await getWashoutBoard({ force: true, range: "1d" });
  console.log(
    JSON.stringify({
      tapeYmd: board.sessionDate,
      index: Number(board.index.toFixed(2)),
      names: board.items.length,
      points: board.series.length,
    })
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
