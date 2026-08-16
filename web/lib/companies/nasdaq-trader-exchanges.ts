/**
 * Nasdaq Trader symbol directories — distinguishes NYSE (N) vs AMEX (A).
 * SEC company_tickers_exchange.json currently only emits Nasdaq | NYSE.
 */

const NASDAQ_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
const OTHER_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt";

function normTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/\./g, "-");
}

function mapOtherExchange(code: string): "NASDAQ" | "NYSE" | "AMEX" | null {
  const c = code.trim().toUpperCase();
  if (c === "A") return "AMEX";
  if (c === "N" || c === "P") return "NYSE";
  return null;
}

export async function fetchNasdaqTraderExchanges(): Promise<Map<string, "NASDAQ" | "NYSE" | "AMEX">> {
  const out = new Map<string, "NASDAQ" | "NYSE" | "AMEX">();
  const [nasdaqRes, otherRes] = await Promise.all([
    fetch(NASDAQ_LISTED, { cache: "no-store" }),
    fetch(OTHER_LISTED, { cache: "no-store" }),
  ]);
  if (nasdaqRes.ok) {
    const text = await nasdaqRes.text();
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith("Symbol") || line.startsWith("File Creation")) continue;
      const ticker = normTicker(line.split("|")[0] ?? "");
      if (ticker) out.set(ticker, "NASDAQ");
    }
  }
  if (otherRes.ok) {
    const text = await otherRes.text();
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith("ACT Symbol") || line.startsWith("File Creation")) continue;
      const cols = line.split("|");
      const ticker = normTicker(cols[0] ?? "");
      const mapped = mapOtherExchange(cols[2] ?? "");
      if (ticker && mapped) out.set(ticker, mapped);
    }
  }
  return out;
}
