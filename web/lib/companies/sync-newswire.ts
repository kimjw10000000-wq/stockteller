import type { SupabaseClient } from "@supabase/supabase-js";
import { detectNewswireForCik } from "./newswire";
import { sleep } from "@/lib/sec/edgar-client";

/** Small batch — each ticker may hit several SEC documents */
export const DEFAULT_NEWSWIRE_BATCH = 8;

export type NewswireSyncResult = {
  attempted: number;
  updated: number;
  errors: number;
};

/**
 * Rotate through companies missing (or oldest) primary_newswire
 * and upsert from Exhibit 99.1 parsing. Never called on user search path.
 */
export async function refreshPrimaryNewswires(
  admin: SupabaseClient,
  batchSize = DEFAULT_NEWSWIRE_BATCH
): Promise<NewswireSyncResult> {
  const limit = Math.min(Math.max(batchSize, 0), 40);
  if (limit === 0) return { attempted: 0, updated: 0, errors: 0 };

  const { data, error } = await admin
    .from("us_listed_companies")
    .select("ticker,cik")
    .eq("is_active", true)
    .order("newswire_updated_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) throw new Error(`newswire select: ${error.message}`);

  const rows = (data ?? []) as Array<{ ticker: string; cik: string }>;
  let updated = 0;
  let errors = 0;
  const now = new Date().toISOString();

  for (const row of rows) {
    try {
      const wire = await detectNewswireForCik(row.cik);
      const { error: upErr } = await admin
        .from("us_listed_companies")
        .update({
          primary_newswire: wire,
          newswire_updated_at: now,
          updated_at: now,
        })
        .eq("ticker", row.ticker);
      if (upErr) errors += 1;
      else updated += 1;
    } catch {
      errors += 1;
      // Still stamp updated_at so we rotate past hard failures
      await admin
        .from("us_listed_companies")
        .update({ newswire_updated_at: now })
        .eq("ticker", row.ticker);
    }
    await sleep(200);
  }

  return { attempted: rows.length, updated, errors };
}
