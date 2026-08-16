/**
 * Fill us_listed_companies.exchange from SEC company_tickers_exchange.json.
 * Labels: NASDAQ | AMEX | NYSE
 *
 *   npx tsx scripts/backfill-exchange.ts
 */
import { config } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "../lib/supabase/admin";
import { fetchSecExchangeTickers } from "../lib/companies/sec-exchange-tickers";
import { fetchNasdaqTraderExchanges } from "../lib/companies/nasdaq-trader-exchanges";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const CHUNK = 500;

async function main() {
  const admin = createAdminClient();
  const [sec, trader] = await Promise.all([
    fetchSecExchangeTickers(),
    fetchNasdaqTraderExchanges(),
  ]);
  const byTicker = new Map(sec.map((r) => [r.ticker, trader.get(r.ticker) ?? r.exchange]));
  console.log(
    JSON.stringify({
      secRows: sec.length,
      traderRows: trader.size,
      amexInTrader: [...trader.values()].filter((e) => e === "AMEX").length,
    })
  );

  const PAGE = 1000;
  const rows: Array<{ ticker: string; exchange: string }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("us_listed_companies")
      .select("ticker,exchange")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as Array<{ ticker: string; exchange: string }>;
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }

  let updated = 0;
  let missing = 0;
  const pending: Array<{ ticker: string; exchange: string }> = [];
  for (const row of rows) {
    const next = byTicker.get(row.ticker.trim().toUpperCase().replace(/\./g, "-"));
    if (!next) {
      missing += 1;
      continue;
    }
    if (row.exchange === next) continue;
    pending.push({ ticker: row.ticker, exchange: next });
  }

  for (let i = 0; i < pending.length; i += CHUNK) {
    const slice = pending.slice(i, i + CHUNK);
    await Promise.all(
      slice.map(async (r) => {
        const { error } = await admin
          .from("us_listed_companies")
          .update({ exchange: r.exchange })
          .eq("ticker", r.ticker);
        if (!error) updated += 1;
      })
    );
  }

  console.log(
    JSON.stringify({
      done: true,
      dbRows: rows.length,
      toUpdate: pending.length,
      updated,
      notInSecMap: missing,
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
