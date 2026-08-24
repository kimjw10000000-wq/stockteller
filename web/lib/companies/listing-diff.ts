export type ListedExchange = "NASDAQ" | "NYSE" | "AMEX" | "OTC" | "OTHER";

export type SecListingRow = {
  ticker: string;
  name: string;
  cik: string;
  exchange: ListedExchange;
};

export type DbListingRow = {
  ticker: string;
  name: string;
  cik: string;
  exchange: string;
  is_active: boolean;
  previous_tickers: string[];
};

export type ListingRename = {
  from: string;
  to: string;
  cik: string;
  name: string;
  exchange: ListedExchange;
  previous_tickers: string[];
};

export type ListingInsert = SecListingRow;

export type ListingUpdate = SecListingRow & {
  previous_tickers?: string[];
};

export type ListingDiffPlan = {
  inserts: ListingInsert[];
  updates: ListingUpdate[];
  renames: ListingRename[];
  deactivates: string[];
};

const SEARCH_LISTED = new Set<ListedExchange>(["NASDAQ", "NYSE", "AMEX"]);

export function isSearchListedExchange(exchange: string): boolean {
  return SEARCH_LISTED.has(exchange.toUpperCase() as ListedExchange);
}

export function parsePreviousTickers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const t = String(item ?? "")
      .trim()
      .toUpperCase()
      .replace(/\./g, "-");
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function appendPrevious(existing: string[], extra: string): string[] {
  const next = parsePreviousTickers(existing);
  const t = extra.trim().toUpperCase().replace(/\./g, "-");
  if (!t || next.includes(t)) return next;
  next.push(t);
  return next;
}

function cikRows(db: DbListingRow[]): Map<string, DbListingRow[]> {
  const map = new Map<string, DbListingRow[]>();
  for (const row of db) {
    const list = map.get(row.cik) ?? [];
    list.push(row);
    map.set(row.cik, list);
  }
  return map;
}

/**
 * SEC listed universe vs DB. Dual-class issuers (same CIK, two tickers) stay as two rows.
 * 1:1 ticker rename on a CIK updates the existing row; leftover active tickers go OTC/inactive.
 */
export function planUsListedDiff(sec: SecListingRow[], db: DbListingRow[]): ListingDiffPlan {
  const listed = sec.filter((r) => isSearchListedExchange(r.exchange));
  const secByTicker = new Map(listed.map((r) => [r.ticker, r]));
  const secByCik = new Map<string, SecListingRow[]>();
  for (const row of listed) {
    const list = secByCik.get(row.cik) ?? [];
    list.push(row);
    secByCik.set(row.cik, list);
  }

  const dbByTicker = new Map(db.map((r) => [r.ticker, r]));
  const dbByCik = cikRows(db);

  const inserts: ListingInsert[] = [];
  const updates: ListingUpdate[] = [];
  const renames: ListingRename[] = [];
  const deactivate = new Set<string>();
  const claimedNew = new Set<string>();
  const renamedAway = new Set<string>();

  for (const [cik, secRows] of secByCik) {
    const dbRows = dbByCik.get(cik) ?? [];
    const dbActive = dbRows.filter((r) => r.is_active);
    const orphans = dbActive.filter((r) => !secByTicker.has(r.ticker));
    const newcomers = secRows.filter((r) => !dbByTicker.has(r.ticker) && !claimedNew.has(r.ticker));

    if (orphans.length === 1 && newcomers.length === 1) {
      const from = orphans[0];
      const to = newcomers[0];
      if (from && to) {
        claimedNew.add(to.ticker);
        renamedAway.add(from.ticker);
        renames.push({
          from: from.ticker,
          to: to.ticker,
          cik,
          name: to.name,
          exchange: to.exchange,
          previous_tickers: appendPrevious(from.previous_tickers, from.ticker),
        });
      }
    }
  }

  for (const row of listed) {
    if (claimedNew.has(row.ticker) && !dbByTicker.has(row.ticker)) continue;
    const existing = dbByTicker.get(row.ticker);
    if (!existing) {
      inserts.push(row);
      continue;
    }
    const extraHistory: string[] = [];
    const siblings = dbByCik.get(row.cik) ?? [];
    for (const sib of siblings) {
      if (sib.ticker === row.ticker) continue;
      if (sib.is_active && !secByTicker.has(sib.ticker) && !renamedAway.has(sib.ticker)) {
        extraHistory.push(sib.ticker);
      }
    }
    let previous = existing.previous_tickers;
    for (const t of extraHistory) previous = appendPrevious(previous, t);

    const needsUpdate =
      existing.name !== row.name ||
      existing.exchange !== row.exchange ||
      existing.cik !== row.cik ||
      existing.is_active !== true ||
      previous.join("|") !== existing.previous_tickers.join("|");
    if (needsUpdate) {
      updates.push({ ...row, previous_tickers: previous });
    }
  }

  for (const row of db) {
    if (!row.is_active) continue;
    if (secByTicker.has(row.ticker)) continue;
    if (renamedAway.has(row.ticker)) continue;
    deactivate.add(row.ticker);
  }

  return {
    inserts,
    updates,
    renames,
    deactivates: [...deactivate],
  };
}
