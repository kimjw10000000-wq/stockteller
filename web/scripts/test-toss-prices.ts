/**
 * One-shot Toss prices probe. Prints field names + lastPrice/changePct only (no secrets).
 * Usage: npx tsx scripts/test-toss-prices.ts AAPL TSLA
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { fetchTossPrices } from "../lib/toss/market-data";
import { fetchTossCandlesPage } from "../lib/toss/market-data";
import { fetchTossRankings } from "../lib/toss/rankings";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

function keysOf(v: unknown): string[] {
  if (!v || typeof v !== "object") return [];
  return Object.keys(v as Record<string, unknown>).slice(0, 40);
}

async function main(): Promise<void> {
  const symbols = process.argv.slice(2).map((s) => s.trim().toUpperCase()).filter(Boolean);
  const list = symbols.length ? symbols.slice(0, 5) : ["AAPL"];

  const prices = await fetchTossPrices(list);
  for (const p of prices) {
    console.log(
      JSON.stringify({
        source: "prices",
        symbol: p.symbol,
        lastPrice: p.lastPrice,
        changePct: p.changePct,
        currency: p.currency,
        rawKeys: keysOf(p.raw),
      })
    );
  }

  const candles = await fetchTossCandlesPage(list[0], "1d", { count: 2 });
  console.log(
    JSON.stringify({
      source: "candles",
      symbol: candles.symbol,
      closes: candles.candles.map((c) => c.close),
    })
  );

  const gainers = await fetchTossRankings({
    type: "TOP_GAINERS",
    marketCountry: "US",
    duration: "1d",
    count: 3,
  });
  console.log(
    JSON.stringify({
      source: "rankings",
      sample: (gainers.rankings ?? []).slice(0, 3).map((r) => ({
        symbol: r.symbol,
        lastPrice: r.lastPrice,
        changeRate: r.changeRate,
      })),
    })
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
