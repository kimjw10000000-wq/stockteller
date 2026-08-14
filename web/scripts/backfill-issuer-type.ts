/**
 * Backfill us_listed_companies.issuer_type from SEC submissions metadata.
 *
 *   npx tsx scripts/backfill-issuer-type.ts
 *   npx tsx scripts/backfill-issuer-type.ts --limit=50
 *   npx tsx scripts/backfill-issuer-type.ts --force
 *
 * Requires column issuer_type (migration 20260814_us_listed_companies_issuer_type.sql).
 * SEC fair-access: ~8 req/s. Unique CIKs for 7.6k tickers ≈ 15–20 min.
 */
import { config } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "../lib/supabase/admin";
import {
  classifyIssuerType,
  fetchSecSubmissions,
  padCik,
  type IssuerType,
} from "../lib/companies/issuer-type";
import { sleep } from "../lib/sec/edgar-client";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const PAGE = 1000;
const DEFAULT_SLEEP_MS = 130;

function argNum(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) ? n : fallback;
}

async function loadRows(force: boolean) {
  const admin = createAdminClient();
  const rows: Array<{ ticker: string; cik: string }> = [];
  for (let from = 0; ; from += PAGE) {
    let q = admin.from("us_listed_companies").select("ticker,cik").range(from, from + PAGE - 1);
    if (!force) q = q.is("issuer_type", null);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as Array<{ ticker: string; cik: string }>;
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return rows;
}

function uniqueCiks(
  rows: Array<{ ticker: string; cik: string }>,
  limit: number
): Array<{ cik: string; tickers: string[] }> {
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const cik = padCik(r.cik);
    if (!cik || cik === "0000000000") continue;
    const list = map.get(cik) ?? [];
    list.push(r.ticker);
    map.set(cik, list);
  }
  const out = Array.from(map.entries()).map(([cik, tickers]) => ({ cik, tickers }));
  if (limit > 0) return out.slice(0, limit);
  return out;
}

async function main() {
  const force = process.argv.includes("--force");
  const limit = argNum("limit", 0);
  const sleepMs = Math.max(argNum("sleep-ms", DEFAULT_SLEEP_MS), 80);
  const admin = createAdminClient();

  const rows = await loadRows(force);
  const groups = uniqueCiks(rows, limit);
  console.log(
    JSON.stringify({
      rows: rows.length,
      uniqueCiks: groups.length,
      force,
      sleepMs,
    })
  );

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  const byType: Record<string, number> = { DOMESTIC: 0, FOREIGN: 0, null: 0 };
  const errors: string[] = [];

  for (let i = 0; i < groups.length; i++) {
    const { cik, tickers } = groups[i]!;
    try {
      const meta = await fetchSecSubmissions(cik);
      const classified = classifyIssuerType(meta);
      if (!classified.issuerType) {
        skipped += 1;
        byType.null += 1;
      } else {
        const issuer_type: IssuerType = classified.issuerType;
        const { error } = await admin
          .from("us_listed_companies")
          .update({ issuer_type })
          .in("ticker", tickers);
        if (error) throw new Error(error.message);
        ok += 1;
        byType[issuer_type] += 1;
      }
    } catch (e) {
      failed += 1;
      const msg = `${cik}: ${e instanceof Error ? e.message : String(e)}`;
      if (errors.length < 25) errors.push(msg);
      if (/HTTP 429|HTTP 503/.test(msg)) {
        await sleep(5000);
      }
    }

    if ((i + 1) % 50 === 0 || i + 1 === groups.length) {
      console.log(
        JSON.stringify({
          progress: `${i + 1}/${groups.length}`,
          ok,
          skipped,
          failed,
          byType,
        })
      );
    }
    await sleep(sleepMs);
  }

  console.log(JSON.stringify({ done: true, ok, skipped, failed, byType, errors }, null, 2));
  if (failed > 0 && ok === 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
