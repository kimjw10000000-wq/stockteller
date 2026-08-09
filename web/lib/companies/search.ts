import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsListedCompanyRow } from "./types";

function sanitizeIlike(q: string): string {
  return q.trim().replace(/[%_,]/g, " ").replace(/\s+/g, " ").trim();
}

export async function searchUsListedCompanies(
  admin: SupabaseClient,
  query: string,
  limit = 20
): Promise<UsListedCompanyRow[]> {
  const q = sanitizeIlike(query);
  if (!q) return [];

  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const pattern = `%${q}%`;
  const select =
    "ticker,name,market_cap,cik,exchange,updated_at,market_cap_updated_at";

  const [byTicker, byName] = await Promise.all([
    admin
      .from("us_listed_companies")
      .select(select)
      .ilike("ticker", pattern)
      .order("ticker", { ascending: true })
      .limit(safeLimit),
    admin
      .from("us_listed_companies")
      .select(select)
      .ilike("name", pattern)
      .order("ticker", { ascending: true })
      .limit(safeLimit),
  ]);

  if (byTicker.error && byName.error) {
    throw new Error(byTicker.error.message || byName.error.message);
  }

  const map = new Map<string, UsListedCompanyRow>();
  for (const row of [...(byTicker.data ?? []), ...(byName.data ?? [])]) {
    const r = row as UsListedCompanyRow;
    if (!map.has(r.ticker)) map.set(r.ticker, r);
  }

  // Prefer exact ticker match first
  const upper = q.toUpperCase();
  return Array.from(map.values())
    .sort((a, b) => {
      const ae = a.ticker === upper ? 0 : a.ticker.startsWith(upper) ? 1 : 2;
      const be = b.ticker === upper ? 0 : b.ticker.startsWith(upper) ? 1 : 2;
      if (ae !== be) return ae - be;
      return a.ticker.localeCompare(b.ticker);
    })
    .slice(0, safeLimit);
}

export async function getUsListedCompany(
  admin: SupabaseClient,
  ticker: string
): Promise<UsListedCompanyRow | null> {
  const t = ticker.trim().toUpperCase().replace(/\./g, "-");
  if (!t) return null;
  const { data, error } = await admin
    .from("us_listed_companies")
    .select("ticker,name,market_cap,cik,exchange,updated_at,market_cap_updated_at")
    .eq("ticker", t)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as UsListedCompanyRow | null) ?? null;
}
