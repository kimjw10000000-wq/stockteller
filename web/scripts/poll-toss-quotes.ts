/**
 * VPS loop: Toss prices → ticker_quotes for News/SEC cards.
 * US extended hours 04:00–20:00 ET: every 15s. Otherwise every 60s.
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TOSSINVEST_CLIENT_ID, TOSSINVEST_CLIENT_SECRET
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { isUsQuoteRushWindow, tossQuotePollIntervalMs } from "../lib/quotes/poll-window";
import { syncTossQuotesForWireNews } from "../lib/quotes/sync-toss-quotes";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function loop(): Promise<void> {
  for (;;) {
    const rush = isUsQuoteRushWindow();
    try {
      const result = await syncTossQuotesForWireNews();
      console.log(
        new Date().toISOString(),
        rush ? "session-15s" : "idle-60s",
        `tickers=${result.tickers} upserted=${result.upserted} pct=${result.withPct}`,
        `prices=${result.fromPrices} rankings=${result.fromRankings} candles=${result.fromCandles}`
      );
    } catch (e) {
      console.error(new Date().toISOString(), e instanceof Error ? e.message : e);
    }
    await sleep(tossQuotePollIntervalMs());
  }
}

loop().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
