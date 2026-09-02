/**
 * CLI: SEC 8-K / 6-K + Exhibit 99.1 press release → Groq Korean summary → wire_news.
 * Usage: npx tsx scripts/crawl-edgar-6k.ts RDHL CLGN
 *        npx tsx scripts/crawl-edgar-6k.ts --form=8-k
 * No ticker args: latest current Atom for that form (cron behavior).
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { runEdgar6kCrawl, type EdgarPressForm } from "../lib/crawl/edgar-6k-crawl";
import { priorSessionClose } from "../lib/quotes/prev-close";
import { hideSplitDistortedPct } from "../lib/quotes/split-adjusted";
import { upsertTickerQuotes } from "../lib/quotes/ticker-quotes";
import type { TickerQuote } from "../lib/quotes/types";
import { isTossConfigured } from "../lib/toss/client";
import { fetchTossCandlesPage, fetchTossPrices } from "../lib/toss/market-data";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

function roundPct(n: number): number {
  return Math.round(n * 100) / 100;
}

async function syncTossQuotes(tickers: string[]): Promise<void> {
  if (!tickers.length) return;
  if (!isTossConfigured()) {
    console.warn("[edgar-6k] Toss 미설정 — 등락률은 VPS 폴러가 채울 때까지 비어 있을 수 있습니다.");
    return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !service) return;

  const prices = await fetchTossPrices(tickers);
  const now = new Date().toISOString();
  const bySymbol = new Map(prices.map((p) => [p.symbol.trim().toUpperCase(), p]));
  const quotes: TickerQuote[] = [];
  for (const ticker of tickers) {
    const p = bySymbol.get(ticker);
    const lastPrice = p?.lastPrice ?? null;
    let rawPct = p?.changePct == null ? null : roundPct(p.changePct);
    if (rawPct == null) {
      try {
        const page = await fetchTossCandlesPage(ticker, "1d", { count: 4 });
        const last = lastPrice ?? page.candles.at(-1)?.close ?? null;
        const prev = priorSessionClose(page.candles);
        if (prev != null && last != null) {
          rawPct = roundPct(((last - prev) / prev) * 100);
        }
        quotes.push({
          ticker,
          lastPrice: last,
          changePct: hideSplitDistortedPct(rawPct, last),
          currency: p?.currency ?? "USD",
          fetchedAt: now,
        });
        continue;
      } catch (e) {
        console.warn("[edgar-6k] toss candles", ticker, e instanceof Error ? e.message : e);
      }
    }
    quotes.push({
      ticker,
      lastPrice,
      changePct: hideSplitDistortedPct(rawPct, lastPrice),
      currency: p?.currency ?? "USD",
      fetchedAt: now,
    });
  }

  const client = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const n = await upsertTickerQuotes(client, quotes);
  console.log(
    `[edgar-6k] toss quotes upserted ${n} (${quotes
      .map((q) => `${q.ticker}:${q.changePct == null ? "n/a" : q.changePct + "%"}`)
      .join(", ")})`
  );
}

function parseCli(): { form: EdgarPressForm; tickers: string[] } {
  let form: EdgarPressForm = "6-k";
  const tickers: string[] = [];
  for (const raw of process.argv.slice(2)) {
    if (raw.startsWith("--form=")) {
      const v = raw.slice(7).toLowerCase().replace("/", "-");
      if (v === "8-k" || v === "8k") form = "8-k";
      else if (v === "6-k" || v === "6k") form = "6-k";
      continue;
    }
    if (raw.startsWith("--")) continue;
    const t = raw.trim().toUpperCase();
    if (t) tickers.push(t);
  }
  return { form, tickers };
}

const { form, tickers } = parseCli();

runEdgar6kCrawl(undefined, tickers.length ? { form, tickers, latestPerTicker: 1 } : { form })
  .then(async (r) => {
    console.log(r.message);
    if (r.tickers?.length) await syncTossQuotes(r.tickers);
    process.exit(r.ok ? 0 : 1);
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
