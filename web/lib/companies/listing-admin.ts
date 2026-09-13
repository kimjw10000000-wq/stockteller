import type { SupabaseClient } from "@supabase/supabase-js";
import { polygonStarterKey } from "@/lib/us-market/polygon-keys";
import { classifyShareClass } from "./share-class";
import { fetchNasdaqTraderListings, type TraderListing } from "./nasdaq-trader-exchanges";
import {
  parsePreviousTickers,
  resolveListedIssuerParent,
  isWarrantPreferredOrUnit,
  findIssuerParentTicker,
} from "./listing-diff";
import { fetchPolygonTickerCiks } from "./polygon-ticker-cik";
import { lookupCikFromRecent12b } from "./edgar-12b-index";

const PAGE = 1000;

export type ListingAdminRow = {
  ticker: string;
  name: string;
  cik: string;
  exchange: string;
};

export type PairedJuniorRow = {
  ticker: string;
  name: string;
  exchange: string;
  parentTicker: string;
};

export type ListingScanResult = {
  traderCount: number;
  matched: number;
  listA: ListingAdminRow[];
  listB: ListingAdminRow[];
  listBPick: ListingAdminRow[];
  aliases: Array<{ oldTicker: string; newTicker: string }>;
  prunedAliases: string[];
  inheritedJuniors: number;
  pairedJuniors: PairedJuniorRow[];
};

type DbCompany = {
  ticker: string;
  name: string;
  cik: string;
  exchange: string;
  is_active: boolean;
  previous_tickers: string[];
  updated_at: string;
};

function parentPool(db: DbCompany[]) {
  return db.map((row) => ({
    ticker: row.ticker,
    cik: row.cik,
    previous_tickers: row.previous_tickers,
  }));
}

async function upsertInheritedJunior(
  admin: SupabaseClient,
  row: TraderListing,
  cik: string,
  now: string,
  previousTickers: string[]
): Promise<boolean> {
  const { error } = await admin.from("us_listed_companies").upsert(
    {
      ticker: row.ticker,
      name: row.name,
      cik,
      exchange: row.exchange,
      share_class: classifyShareClass({ ticker: row.ticker, name: row.name }),
      is_active: true,
      previous_tickers: previousTickers,
      updated_at: now,
    },
    { onConflict: "ticker" }
  );
  return !error;
}

export async function inheritWarrantPreferredCiks(
  admin: SupabaseClient,
  trader: TraderListing[],
  db: DbCompany[],
  now: string
): Promise<number> {
  const siblings = [...new Set([...trader.map((r) => r.ticker), ...db.map((r) => r.ticker)])];
  const dbBy = new Map(db.map((r) => [r.ticker, r]));
  let n = 0;
  const pending = trader.filter((row) => isWarrantPreferredOrUnit(row.ticker, siblings));
  for (let i = 0; i < pending.length; i += 40) {
    const chunk = pending.slice(i, i + 40);
    await Promise.all(
      chunk.map(async (row) => {
        const parent = resolveListedIssuerParent(row.ticker, parentPool([...dbBy.values()]));
        if (!parent) return;
        const existing = dbBy.get(row.ticker);
        if (
          existing &&
          existing.cik === parent.cik &&
          existing.is_active &&
          existing.exchange === row.exchange &&
          (!row.name || existing.name === row.name)
        ) {
          return;
        }
        const ok = await upsertInheritedJunior(
          admin,
          row,
          parent.cik,
          now,
          existing?.previous_tickers ?? []
        );
        if (!ok) return;
        dbBy.set(row.ticker, {
          ticker: row.ticker,
          name: row.name,
          cik: parent.cik,
          exchange: row.exchange,
          is_active: true,
          previous_tickers: existing?.previous_tickers ?? [],
          updated_at: now,
        });
        n += 1;
      })
    );
  }
  return n;
}

function norm(raw: string): string {
  return raw.trim().toUpperCase().replace(/\./g, "-");
}

async function loadDbCompanies(admin: SupabaseClient): Promise<DbCompany[]> {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("us_listed_companies")
      .select("ticker,name,cik,exchange,is_active,previous_tickers,updated_at")
      .order("ticker", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const chunk = data ?? [];
    for (const r of chunk) {
      rows.push({
        ticker: norm(String(r.ticker)),
        name: String(r.name ?? ""),
        cik: String(r.cik ?? "").replace(/\D/g, "").padStart(10, "0"),
        exchange: String(r.exchange ?? "").toUpperCase(),
        is_active: r.is_active !== false,
        previous_tickers: parsePreviousTickers(r.previous_tickers),
        updated_at: String(r.updated_at ?? ""),
      });
    }
    if (chunk.length < PAGE) break;
  }
  return rows;
}

export async function loadTickerChangeAliases(
  admin: SupabaseClient
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const { data, error } = await admin.from("ticker_change_aliases").select("old_ticker,new_ticker");
  if (error) {
    if (/ticker_change_aliases/i.test(error.message)) return out;
    throw new Error(error.message);
  }
  for (const row of data ?? []) {
    const oldT = norm(String(row.old_ticker));
    const newT = norm(String(row.new_ticker));
    if (oldT && newT) out.set(oldT, newT);
  }
  return out;
}

/** 404 → 죽은 구티커. 200이면 CIK가 없어도 Polygon이 아직 그 심볼을 갖고 있음. */
async function polygonTickerAlive(ticker: string): Promise<boolean> {
  const key = polygonStarterKey();
  const symbols = [ticker, ticker.replace(/-/g, ".")];
  for (const symbol of [...new Set(symbols)]) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(
        `https://api.polygon.io/v3/reference/tickers/${encodeURIComponent(symbol)}`,
        { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" }
      );
      if (res.status === 404) break;
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
        continue;
      }
      if (res.ok) return true;
      break;
    }
  }
  return false;
}

export async function pruneDeadAliases(admin: SupabaseClient): Promise<string[]> {
  const aliases = await loadTickerChangeAliases(admin);
  const removed: string[] = [];
  for (const oldTicker of aliases.keys()) {
    const alive = await polygonTickerAlive(oldTicker);
    if (alive) continue;
    const { error } = await admin.from("ticker_change_aliases").delete().eq("old_ticker", oldTicker);
    if (!error) removed.push(oldTicker);
  }
  return removed;
}

export async function diffListings(admin: SupabaseClient): Promise<{
  traderCount: number;
  listA: ListingAdminRow[];
  listB: ListingAdminRow[];
  listBPick: ListingAdminRow[];
  pairedJuniors: PairedJuniorRow[];
  aliases: Array<{ oldTicker: string; newTicker: string }>;
}> {
  const [trader, db, aliases] = await Promise.all([
    fetchNasdaqTraderListings(),
    loadDbCompanies(admin),
    loadTickerChangeAliases(admin),
  ]);
  const traderBy = new Map(trader.map((r) => [r.ticker, r]));
  const dbBy = new Map(db.map((r) => [r.ticker, r]));
  const traderTickers = trader.map((r) => r.ticker);
  const missingTrader = trader.filter((row) => !dbBy.has(row.ticker));
  const pairedJuniors: PairedJuniorRow[] = [];
  const listA: ListingAdminRow[] = [];
  for (const row of missingTrader) {
    const parentTicker = findIssuerParentTicker(row.ticker, traderTickers);
    if (parentTicker && !dbBy.has(parentTicker) && traderBy.has(parentTicker)) {
      pairedJuniors.push({
        ticker: row.ticker,
        name: row.name,
        exchange: row.exchange,
        parentTicker,
      });
      continue;
    }
    listA.push({ ticker: row.ticker, name: row.name, cik: "", exchange: row.exchange });
  }
  listA.sort((a, b) => a.ticker.localeCompare(b.ticker));
  pairedJuniors.sort((a, b) => a.ticker.localeCompare(b.ticker));
  const missing = db.filter((row) => !traderBy.has(row.ticker));
  const listB: ListingAdminRow[] = missing
    .filter((row) => row.is_active && row.exchange !== "OTC")
    .map((row) => ({ ticker: row.ticker, name: row.name, cik: row.cik, exchange: row.exchange }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
  const recentMs = Date.now() - 180 * 24 * 60 * 60 * 1000;
  const listBPick: ListingAdminRow[] = missing
    .filter((row) => {
      if (row.is_active && row.exchange !== "OTC") return true;
      const t = Date.parse(row.updated_at);
      return Number.isFinite(t) && t >= recentMs;
    })
    .map((row) => ({ ticker: row.ticker, name: row.name, cik: row.cik, exchange: row.exchange }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
  return {
    traderCount: trader.length,
    listA,
    listB,
    listBPick,
    pairedJuniors,
    aliases: [...aliases.entries()].map(([oldTicker, newTicker]) => ({ oldTicker, newTicker })),
  };
}

export async function scanListingUpdate(admin: SupabaseClient): Promise<ListingScanResult> {
  const prunedAliases = await pruneDeadAliases(admin);
  const [trader, db] = await Promise.all([fetchNasdaqTraderListings(), loadDbCompanies(admin)]);
  const dbBy = new Map(db.map((r) => [r.ticker, r]));
  const now = new Date().toISOString();

  let matched = 0;
  const updates = trader.filter((row) => {
    const existing = dbBy.get(row.ticker);
    if (!existing) return false;
    matched += 1;
    const name = row.name || existing.name;
    return (
      !existing.is_active ||
      existing.exchange !== row.exchange ||
      (row.name && existing.name !== name)
    );
  });
  for (let i = 0; i < updates.length; i += 80) {
    const chunk = updates.slice(i, i + 80);
    await Promise.all(
      chunk.map(async (row) => {
        const existing = dbBy.get(row.ticker);
        if (!existing) return;
        const { error } = await admin
          .from("us_listed_companies")
          .update({
            name: row.name || existing.name,
            cik: existing.cik,
            exchange: row.exchange,
            is_active: true,
            updated_at: now,
          })
          .eq("ticker", row.ticker);
        if (error) matched -= 1;
      })
    );
  }

  const inheritedJuniors = await inheritWarrantPreferredCiks(admin, trader, db, now);

  const diff = await diffListings(admin);
  return {
    traderCount: diff.traderCount,
    matched,
    listA: diff.listA,
    listB: diff.listB,
    listBPick: diff.listBPick,
    aliases: diff.aliases,
    prunedAliases,
    inheritedJuniors,
    pairedJuniors: diff.pairedJuniors,
  };
}

export async function listingIpoInsert(
  admin: SupabaseClient,
  tickerRaw: string
): Promise<{ ticker: string; cik: string; cikSource: "parent" | "polygon" | "edgar" }> {
  const ticker = norm(tickerRaw);
  const [trader, db] = await Promise.all([fetchNasdaqTraderListings(), loadDbCompanies(admin)]);
  const row = trader.find((r) => r.ticker === ticker);
  if (!row) throw new Error(`${ticker} 이 거래소 목록에 없습니다.`);
  const now = new Date().toISOString();
  const parentOnFile = findIssuerParentTicker(ticker, trader.map((r) => r.ticker));
  if (parentOnFile && !db.some((r) => r.ticker === parentOnFile)) {
    throw new Error(
      `${ticker}는 ${parentOnFile}와 같이 상장된 워런트·우선주입니다. 일반주 ${parentOnFile}를 먼저 신규상장 또는 티커변경하세요.`
    );
  }
  const parent = resolveListedIssuerParent(ticker, parentPool(db));
  let cik = parent?.cik ?? "";
  let name = row.name;
  let cikSource: "parent" | "polygon" | "edgar" = "parent";
  if (!cik) {
    const hits = await fetchPolygonTickerCiks([ticker]);
    cik = hits.get(ticker)?.cik ?? "";
    name = hits.get(ticker)?.name || row.name;
    if (cik && cik !== "0000000000") cikSource = "polygon";
  }
  if (!cik || cik === "0000000000") {
    const edgar = await lookupCikFromRecent12b(row.name);
    if (!edgar) {
      throw new Error(
        `${ticker}: Polygon에 없고, 최근 45일 8-A12B/10-12B/20FR12B에서 사명이 같은 제출도 없습니다.`
      );
    }
    cik = edgar.cik;
    cikSource = "edgar";
    name = row.name;
  }
  const { error } = await admin.from("us_listed_companies").upsert(
    {
      ticker,
      name,
      cik,
      exchange: row.exchange,
      share_class: classifyShareClass({ ticker, name }),
      is_active: true,
      previous_tickers: [],
      updated_at: now,
    },
    { onConflict: "ticker" }
  );
  if (error) throw new Error(error.message);
  db.push({
    ticker,
    name,
    cik,
    exchange: row.exchange,
    is_active: true,
    previous_tickers: [],
    updated_at: now,
  });
  await inheritWarrantPreferredCiks(admin, trader, db, now);
  return { ticker, cik, cikSource };
}

export async function listingRename(
  admin: SupabaseClient,
  fromRaw: string,
  toRaw: string
): Promise<void> {
  const from = norm(fromRaw);
  const to = norm(toRaw);
  if (from === to) throw new Error("같은 티커입니다.");
  const trader = await fetchNasdaqTraderListings();
  const dest = trader.find((r) => r.ticker === to);
  if (!dest) throw new Error(`${to} 이 거래소 목록에 없습니다.`);

  const { data: src, error: srcErr } = await admin
    .from("us_listed_companies")
    .select("ticker,name,cik,previous_tickers")
    .eq("ticker", from)
    .maybeSingle();
  if (srcErr) throw new Error(srcErr.message);
  if (!src) throw new Error(`${from} 행이 DB에 없습니다.`);

  const now = new Date().toISOString();
  const previous = parsePreviousTickers(src.previous_tickers);
  if (!previous.includes(from)) previous.push(from);
  const cik = String(src.cik ?? "").replace(/\D/g, "").padStart(10, "0");
  const name = dest.name || String(src.name ?? to);

  const { error } = await admin
    .from("us_listed_companies")
    .update({
      ticker: to,
      name,
      cik,
      exchange: dest.exchange,
      share_class: classifyShareClass({ ticker: to, name }),
      is_active: true,
      previous_tickers: previous,
      updated_at: now,
    })
    .eq("ticker", from);

  if (error) {
    await admin.from("us_listed_companies").upsert(
      {
        ticker: to,
        name,
        cik,
        exchange: dest.exchange,
        share_class: classifyShareClass({ ticker: to, name }),
        is_active: true,
        previous_tickers: previous,
        updated_at: now,
      },
      { onConflict: "ticker" }
    );
    await admin
      .from("us_listed_companies")
      .update({ exchange: "OTC", is_active: false, updated_at: now })
      .eq("ticker", from);
  }

  await admin.from("company_analysis_results").update({ ticker: to }).eq("ticker", from);
  await admin.from("wire_news").update({ primary_ticker: to, company_name: name }).eq("primary_ticker", from);

  const { error: aliasErr } = await admin.from("ticker_change_aliases").upsert(
    { old_ticker: from, new_ticker: to, created_at: now },
    { onConflict: "old_ticker" }
  );
  if (aliasErr && !/ticker_change_aliases/i.test(aliasErr.message)) {
    throw new Error(aliasErr.message);
  }
  const db = await loadDbCompanies(admin);
  await inheritWarrantPreferredCiks(admin, trader, db, now);
}

export async function otcRemainingListB(admin: SupabaseClient): Promise<number> {
  const diff = await diffListings(admin);
  if (diff.listA.length > 0 || diff.pairedJuniors.length > 0) {
    throw new Error("목록 A와 동시상장 워런트를 먼저 처리하세요.");
  }
  const tickers = diff.listB.map((r) => r.ticker);
  if (!tickers.length) return 0;
  const now = new Date().toISOString();
  let n = 0;
  for (let i = 0; i < tickers.length; i += 200) {
    const chunk = tickers.slice(i, i + 200);
    const { error, count } = await admin
      .from("us_listed_companies")
      .update({ exchange: "OTC", is_active: false, updated_at: now }, { count: "exact" })
      .in("ticker", chunk)
      .eq("is_active", true);
    if (error) throw new Error(error.message);
    n += count ?? chunk.length;
  }
  return n;
}

export function canonicalWashoutTicker(ticker: string, aliases: Map<string, string>): string {
  return aliases.get(norm(ticker)) ?? norm(ticker);
}
