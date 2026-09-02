/**
 * VPS loop: SEC current 8-K + 6-K Atom in the same cycle → Exhibit 99.1 press releases → wire_news.
 * Weekday 04:00–20:00 ET (pre/regular/after): every 200ms.
 * Otherwise (overnight/weekend): every 10 minutes.
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { runEdgar6kCrawl } from "../lib/crawl/edgar-6k-crawl";
import { edgar6kPollIntervalMs } from "../lib/crawl/edgar-6k-poll-window";
import { isGroqConfigured } from "../lib/groq/client";
import { isUsQuoteRushWindow } from "../lib/quotes/poll-window";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function loop(): Promise<void> {
  const seen = new Set<string>();
  let lastLog = 0;
  for (;;) {
    const rush = isUsQuoteRushWindow();
    const interval = edgar6kPollIntervalMs();
    const started = Date.now();
    try {
      const groq = isGroqConfigured();
      const result = await runEdgar6kCrawl(undefined, {
        seenAccessions: seen,
        maxItems: groq ? 1 : 0,
      });
      const due = result.inserted > 0 || Date.now() - lastLog > 60_000;
      if (due) {
        lastLog = Date.now();
        console.log(
          new Date().toISOString(),
          rush ? "session-0.2s" : "idle-10m",
          groq ? result.message : `${result.message} (GROQ_API_KEY missing on this host — list only)`
        );
      }
    } catch (e) {
      console.error(new Date().toISOString(), e instanceof Error ? e.message : e);
    }
    const wait = interval - (Date.now() - started);
    if (wait > 0) await sleep(wait);
  }
}

loop().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
