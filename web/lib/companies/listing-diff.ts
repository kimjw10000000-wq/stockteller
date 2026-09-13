import { isJuniorShareListing } from "./share-class";

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

export type TraderListingRow = {
  ticker: string;
  name: string;
  exchange: ListedExchange;
};

export type PolygonCikHit = {
  cik: string;
  name?: string;
};

function cikLookupCandidates(ticker: string): string[] {
  const t = ticker.trim().toUpperCase().replace(/\./g, "-");
  const out: string[] = [];
  const add = (x: string) => {
    const v = x.trim().toUpperCase();
    if (v && v !== t && !out.includes(v)) out.push(v);
  };

  // NYSE preferred: ABC$A (series A) or ABC$ (no series letter).
  const dollar = /^([A-Z]+)\$(.*)$/.exec(t);
  if (dollar) {
    const base = dollar[1] ?? "";
    const cls = (dollar[2] ?? "").replace(/[^A-Z0-9]/g, "");
    if (cls) {
      add(`${base}-P${cls}`);
      add(`${base}-PR${cls}`);
      add(`${base}P${cls}`);
    }
    add(base);
  }

  const dash = /^([A-Z]+)-([A-Z0-9]+)$/.exec(t);
  if (dash) {
    const base = dash[1] ?? "";
    const suf = dash[2] ?? "";
    add(`${base}${suf}`);
    if (suf === "W" || suf === "WT" || suf === "WS") {
      add(`${base}W`);
      add(`${base}-WT`);
      add(`${base}WS`);
      add(base);
    } else if (suf === "U" || suf === "UN") {
      add(`${base}U`);
      add(`${base}-UN`);
      add(base);
    } else if (suf === "R" || suf === "RT") {
      add(`${base}R`);
      add(`${base}RT`);
      add(base);
    } else if (suf.startsWith("P")) {
      add(base);
    } else {
      add(base);
    }
  }

  if (t.length >= 5 && /[WRU]$/.test(t) && !t.includes("-") && !t.includes("$")) {
    add(t.slice(0, -1));
    if (t.length >= 6) add(t.slice(0, -2));
  }
  return out;
}

export function isPreferredShareTicker(ticker: string): boolean {
  const t = ticker.trim().toUpperCase().replace(/\./g, "-");
  if (t.includes("$")) return true;
  const dash = /^[A-Z]+-([A-Z0-9]+)$/.exec(t);
  if (!dash) return false;
  return /^P(R)?[A-Z0-9]*$/.test(dash[1] ?? "");
}

export function isWarrantPreferredOrUnit(ticker: string, siblingTickers: string[]): boolean {
  if (isPreferredShareTicker(ticker)) return true;
  return isJuniorShareListing(ticker, siblingTickers);
}

export function resolveListedIssuerParent(
  ticker: string,
  known: Array<{ ticker: string; cik: string; previous_tickers?: string[] }>
): { ticker: string; cik: string } | null {
  const t = ticker.trim().toUpperCase().replace(/\./g, "-");
  const valid = known.filter((row) => {
    const cik = String(row.cik ?? "").replace(/\D/g, "").padStart(10, "0");
    return Boolean(cik && cik !== "0000000000");
  });
  const siblings = [
    ...valid.map((row) => row.ticker),
    ...valid.flatMap((row) => row.previous_tickers ?? []),
  ];
  if (!isWarrantPreferredOrUnit(t, siblings)) return null;

  const byTicker = new Map(valid.map((row) => [row.ticker, row]));
  for (const cand of cikLookupCandidates(t)) {
    const hit = byTicker.get(cand);
    if (hit && !isWarrantPreferredOrUnit(hit.ticker, siblings)) {
      return { ticker: hit.ticker, cik: hit.cik };
    }
    for (const row of valid) {
      if ((row.previous_tickers ?? []).includes(cand) && !isWarrantPreferredOrUnit(row.ticker, siblings)) {
        return { ticker: row.ticker, cik: row.cik };
      }
    }
  }

  let best: { ticker: string; cik: string } | null = null;
  for (const row of valid) {
    if (row.ticker === t) continue;
    if (isWarrantPreferredOrUnit(row.ticker, siblings)) continue;
    const bases = [row.ticker, ...(row.previous_tickers ?? [])];
    if (!isJuniorShareListing(t, [...bases, t])) continue;
    if (!best || row.ticker.length > best.ticker.length) {
      best = { ticker: row.ticker, cik: row.cik };
    }
  }
  return best;
}

/** Parent common ticker on the same exchange file, even before that common has a CIK. */
export function findIssuerParentTicker(ticker: string, universe: string[]): string | null {
  const dummyCik = "0000000001";
  const known = universe
    .filter((t) => t !== ticker)
    .map((t) => ({ ticker: t, cik: dummyCik }));
  return resolveListedIssuerParent(ticker, known)?.ticker ?? null;
}

/** Map preferred/warrant/unit ticker spellings onto an issuer already in the SEC map. */
export function lookupSecCikForTraderTicker(
  ticker: string,
  secByTicker: Map<string, SecListingRow>
): SecListingRow | null {
  for (const cand of cikLookupCandidates(ticker)) {
    const hit = secByTicker.get(cand);
    if (hit) return hit;
  }
  return null;
}

/**
 * Exchange directories are the ticker universe. SEC map supplies CIK when the
 * ticker matches. Map tickers missing from the directories become tickerless
 * CIKs. Polygon CIKs fill remaining listed tickers and reclaim a tickerless CIK
 * when they match.
 */
export function buildExchangeListedUniverse(
  trader: TraderListingRow[],
  secMap: SecListingRow[],
  polygonByTicker: Map<string, PolygonCikHit>
): {
  listed: SecListingRow[];
  mapMatched: number;
  aliasFilled: number;
  polygonFilled: number;
  skippedNoCik: string[];
  orphanCiksRemaining: string[];
} {
  const secByTicker = new Map(secMap.map((r) => [r.ticker, r]));
  const traderTickers = new Set(trader.map((r) => r.ticker));
  const ciksOnExchangeFromMap = new Set<string>();
  for (const row of secMap) {
    if (traderTickers.has(row.ticker)) ciksOnExchangeFromMap.add(row.cik);
  }
  const orphanCiks = new Set<string>();
  for (const row of secMap) {
    if (traderTickers.has(row.ticker)) continue;
    if (ciksOnExchangeFromMap.has(row.cik)) continue;
    orphanCiks.add(row.cik);
  }

  const listed: SecListingRow[] = [];
  const skippedNoCik: string[] = [];
  let mapMatched = 0;
  let aliasFilled = 0;
  let polygonFilled = 0;

  for (const row of trader) {
    if (!isSearchListedExchange(row.exchange)) continue;
    const mapped = secByTicker.get(row.ticker);
    if (mapped) {
      mapMatched += 1;
      listed.push({
        ticker: row.ticker,
        name: mapped.name || row.name,
        cik: mapped.cik,
        exchange: row.exchange,
      });
      continue;
    }

    const aliased = lookupSecCikForTraderTicker(row.ticker, secByTicker);
    if (aliased) {
      aliasFilled += 1;
      orphanCiks.delete(aliased.cik);
      listed.push({
        ticker: row.ticker,
        name: aliased.name || row.name,
        cik: aliased.cik,
        exchange: row.exchange,
      });
      continue;
    }

    const poly = polygonByTicker.get(row.ticker);
    const cik = poly?.cik?.replace(/\D/g, "").padStart(10, "0") ?? "";
    if (!cik || cik === "0000000000") {
      skippedNoCik.push(row.ticker);
      continue;
    }
    polygonFilled += 1;
    orphanCiks.delete(cik);
    listed.push({
      ticker: row.ticker,
      name: (poly?.name || row.name).trim() || row.ticker,
      cik,
      exchange: row.exchange,
    });
  }

  return {
    listed,
    mapMatched,
    aliasFilled,
    polygonFilled,
    skippedNoCik,
    orphanCiksRemaining: [...orphanCiks],
  };
}

function mergeDeactivates(plan: ListingDiffPlan, extra: string[]): ListingDiffPlan {
  if (!extra.length) return plan;
  const seen = new Set(plan.deactivates);
  const deactivates = [...plan.deactivates];
  for (const ticker of extra) {
    if (seen.has(ticker)) continue;
    seen.add(ticker);
    deactivates.push(ticker);
  }
  return { ...plan, deactivates };
}

/** Drop leftover tickerless CIKs that Polygon did not reclaim. */
export function deactivateRemainingOrphanCiks(
  plan: ListingDiffPlan,
  db: DbListingRow[],
  listed: SecListingRow[],
  orphanCiksRemaining: string[]
): ListingDiffPlan {
  if (!orphanCiksRemaining.length) return plan;
  const orphans = new Set(orphanCiksRemaining);
  const kept = new Set(listed.map((r) => r.ticker));
  const extra: string[] = [];
  for (const row of db) {
    if (!row.is_active) continue;
    if (!orphans.has(row.cik)) continue;
    if (kept.has(row.ticker)) continue;
    extra.push(row.ticker);
  }
  return mergeDeactivates(plan, extra);
}

/**
 * Listed universe vs DB. Dual-class issuers (same CIK, two tickers) stay as two rows.
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
