/**
 * Nasdaq Trader symbol directories — NASDAQ + NYSE + AMEX (incl. NYSE Arca as NYSE).
 * Skips test issues and ETFs; those are not issuer rows in us_listed_companies.
 */

const NASDAQ_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
const OTHER_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt";

export type TraderExchange = "NASDAQ" | "NYSE" | "AMEX";

export type TraderListing = {
  ticker: string;
  name: string;
  exchange: TraderExchange;
};

function normTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/\./g, "-");
}

function isYes(raw: string | undefined): boolean {
  return (raw ?? "").trim().toUpperCase() === "Y";
}

function mapOtherExchange(code: string): TraderExchange | null {
  const c = code.trim().toUpperCase();
  if (c === "A") return "AMEX";
  if (c === "N" || c === "P") return "NYSE";
  return null;
}

export function parseNasdaqListedText(text: string): TraderListing[] {
  const out: TraderListing[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("Symbol") || line.startsWith("File Creation")) continue;
    const cols = line.split("|");
    if (isYes(cols[3]) || isYes(cols[6])) continue;
    const ticker = normTicker(cols[0] ?? "");
    if (!ticker) continue;
    const name = (cols[1] ?? "").trim() || ticker;
    out.push({ ticker, name, exchange: "NASDAQ" });
  }
  return out;
}

export function parseOtherListedText(text: string): TraderListing[] {
  const out: TraderListing[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("ACT Symbol") || line.startsWith("File Creation")) continue;
    const cols = line.split("|");
    if (isYes(cols[6]) || isYes(cols[4])) continue;
    const ticker = normTicker(cols[0] ?? "");
    const mapped = mapOtherExchange(cols[2] ?? "");
    if (!ticker || !mapped) continue;
    const name = (cols[1] ?? "").trim() || ticker;
    out.push({ ticker, name, exchange: mapped });
  }
  return out;
}

export async function fetchNasdaqTraderListings(): Promise<TraderListing[]> {
  const [nasdaqRes, otherRes] = await Promise.all([
    fetch(NASDAQ_LISTED, { cache: "no-store" }),
    fetch(OTHER_LISTED, { cache: "no-store" }),
  ]);
  if (!nasdaqRes.ok) throw new Error(`nasdaqlisted.txt ${nasdaqRes.status}`);
  if (!otherRes.ok) throw new Error(`otherlisted.txt ${otherRes.status}`);

  const byTicker = new Map<string, TraderListing>();
  for (const row of parseNasdaqListedText(await nasdaqRes.text())) {
    byTicker.set(row.ticker, row);
  }
  for (const row of parseOtherListedText(await otherRes.text())) {
    if (!byTicker.has(row.ticker)) byTicker.set(row.ticker, row);
  }
  return [...byTicker.values()];
}

export async function fetchNasdaqTraderExchanges(): Promise<Map<string, TraderExchange>> {
  const listings = await fetchNasdaqTraderListings();
  return new Map(listings.map((r) => [r.ticker, r.exchange]));
}
