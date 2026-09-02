/**
 * VPS loop: GlobeNewswire RSS → wire_news.
 * Premarket 04:00–09:30 ET: every 15s. Otherwise every 60s.
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { runGnwRssCrawl } from "../lib/crawl/gnw-rss-crawl";
import { gnwPollIntervalMs, isEasternPremarketPollWindow } from "../lib/gnw/poll-window";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function loop(): Promise<void> {
  for (;;) {
    const rush = isEasternPremarketPollWindow();
    try {
      const result = await runGnwRssCrawl();
      console.log(new Date().toISOString(), rush ? "premarket-15s" : "idle-60s", result.message);
    } catch (e) {
      console.error(new Date().toISOString(), e instanceof Error ? e.message : e);
    }
    await sleep(gnwPollIntervalMs());
  }
}

loop().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
