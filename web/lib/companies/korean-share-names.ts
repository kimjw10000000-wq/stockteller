/**
 * 뉴스 공유용 토스 한글 이름.
 * 맥미니만 토스를 부르고 names-ko.json에 넣는다. 사이트는 그 파일만 읽는다.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { isTossConfigured } from "@/lib/toss/client";
import { fetchTossStocks } from "@/lib/toss/stocks";
import { loadPublishedKoreanNames, savePublishedKoreanNames } from "@/lib/us-market/washout-published";

const LOOKUP_LIMIT = 200;

function listingKey(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\./g, "-");
}

function rememberTicker(into: Set<string>, raw: unknown): void {
  const key = listingKey(String(raw ?? ""));
  if (key && key !== "—") into.add(key);
}

async function recentShareTickers(): Promise<string[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const found = new Set<string>();
  const { data, error } = await admin
    .from("wire_news")
    .select("primary_ticker,tickers")
    .gte("published_at", since)
    .limit(1000);
  if (error) throw error;
  for (const row of data ?? []) {
    rememberTicker(found, row.primary_ticker);
    if (Array.isArray(row.tickers)) {
      for (const ticker of row.tickers) rememberTicker(found, ticker);
    }
  }
  const disclosures = await admin
    .from("disclosures")
    .select("stock_code")
    .order("created_at", { ascending: false })
    .limit(200);
  if (!disclosures.error) {
    for (const row of disclosures.data ?? []) rememberTicker(found, row.stock_code);
  }
  return [...found];
}

let stored = new Map<string, string>();
let loaded = false;
const misses = new Set<string>();

export async function refreshKoreanShareNames(extraTickers: string[] = []): Promise<void> {
  if (!isTossConfigured()) return;
  if (!loaded) {
    const existing = await loadPublishedKoreanNames();
    stored = new Map(Object.entries(existing).map(([ticker, name]) => [listingKey(ticker), name]));
    loaded = true;
  }
  const wanted = new Set<string>();
  for (const ticker of await recentShareTickers()) rememberTicker(wanted, ticker);
  for (const ticker of extraTickers) rememberTicker(wanted, ticker);
  const missing = [...wanted].filter((ticker) => !stored.has(ticker) && !misses.has(ticker)).slice(0, LOOKUP_LIMIT);
  if (!missing.length) return;
  console.log(new Date().toISOString(), `toss share names lookup=${missing.length}`);
  const rows = await fetchTossStocks(missing);
  const seen = new Set<string>();
  let added = 0;
  for (const row of rows) {
    const ticker = listingKey(row.symbol);
    const name = row.name.trim();
    if (!ticker || !name) continue;
    seen.add(ticker);
    if (stored.get(ticker) === name) continue;
    stored.set(ticker, name);
    added += 1;
  }
  for (const ticker of missing) {
    if (!seen.has(ticker)) misses.add(ticker);
  }
  if (!added) return;
  const names: Record<string, string> = {};
  for (const [ticker, name] of stored) names[ticker] = name;
  await savePublishedKoreanNames(names);
  console.log(new Date().toISOString(), `toss share names saved=${added} total=${stored.size}`);
}
