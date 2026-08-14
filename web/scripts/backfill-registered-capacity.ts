/**
 * Backfill registered offering capacity from SEC EFFECT + fee exhibits.
 *
 *   npx tsx scripts/backfill-registered-capacity.ts --ticker=ATHX
 *   npx tsx scripts/backfill-registered-capacity.ts --limit=20
 *   npx tsx scripts/backfill-registered-capacity.ts --force
 *   npx tsx scripts/backfill-registered-capacity.ts --force --concurrency=8
 *
 * SEC fair-access: global ~10 req/s limiter in edgar-client. Tickers run in a pool.
 */
import { config } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "../lib/supabase/admin";
import { refreshRegisteredCapacityForTicker } from "../lib/companies/registered-capacity";
import { padCik } from "../lib/companies/issuer-type";
import { sleep } from "../lib/sec/edgar-client";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const PAGE = 1000;

function argNum(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) ? n : fallback;
}

function argStr(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}

async function loadTickers(force: boolean): Promise<string[]> {
  const admin = createAdminClient();
  const rows: Array<{ ticker: string; cik: string }> = [];
  for (let from = 0; ; from += PAGE) {
    let q = admin.from("us_listed_companies").select("ticker,cik").range(from, from + PAGE - 1);
    if (!force) q = q.is("registered_capacity_updated_at", null);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as Array<{ ticker: string; cik: string }>;
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  const seen = new Set<string>();
  const tickers: string[] = [];
  for (const r of rows) {
    const cik = padCik(r.cik);
    if (seen.has(cik)) continue;
    seen.add(cik);
    tickers.push(r.ticker);
  }
  return tickers;
}

async function main() {
  const force = process.argv.includes("--force");
  const limit = argNum("limit", 0);
  const concurrency = Math.min(Math.max(argNum("concurrency", 8), 1), 10);
  const one = argStr("ticker");
  const admin = createAdminClient();
  let tickers = one ? [one.toUpperCase()] : await loadTickers(force);
  if (limit > 0) tickers = tickers.slice(0, limit);

  console.log(JSON.stringify({ count: tickers.length, force, one, concurrency }));
  let ok = 0;
  let failed = 0;
  let cursor = 0;
  let completed = 0;
  const errors: string[] = [];

  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= tickers.length) return;
      const ticker = tickers[idx]!;
      try {
        const scan = await refreshRegisteredCapacityForTicker(admin, ticker);
        ok += 1;
        completed += 1;
        console.log(
          JSON.stringify({
            progress: `${completed}/${tickers.length}`,
            ticker,
            issuerType: scan.issuerType,
            unlimited: scan.isUnlimitedShelf,
            total: scan.totalRegisteredOfferingCapacity,
            filings: scan.filings.length,
            effects: scan.effectsScanned,
          })
        );
      } catch (e) {
        failed += 1;
        completed += 1;
        const msg = `${ticker}: ${e instanceof Error ? e.message : String(e)}`;
        if (errors.length < 20) errors.push(msg);
        console.warn(msg);
        await sleep(400);
      }
    }
  }

  const n = one ? 1 : Math.min(concurrency, tickers.length);
  await Promise.all(Array.from({ length: n }, () => worker()));

  console.log(JSON.stringify({ done: true, ok, failed, errors }, null, 2));
  if (failed > 0 && ok === 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
