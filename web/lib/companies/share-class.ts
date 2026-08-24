export type ShareClass = "CLASS_A" | "CLASS_B" | "CLASS_C" | "ADR" | "COMMON";

const ADR_NAME_RE =
  /\bADRs?\b|\bADSs?\b|American\s+Depositary|Depositary\s+Shares/i;

const CLASS_A_TICKERS = new Set(["GOOGL", "FOXA", "NWSA"]);
/** FOX / NWS are Class B voting shares, not Class C. */
const CLASS_B_TICKERS = new Set(["FOX", "NWS"]);
const CLASS_C_TICKERS = new Set(["GOOG"]);

function normTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/[./]/g, "-");
}

function tickerClassSuffix(ticker: string): "A" | "B" | "C" | null {
  const m = /-([ABC])$/i.exec(ticker);
  if (!m) return null;
  return m[1].toUpperCase() as "A" | "B" | "C";
}

function isAdrName(name: string): boolean {
  return ADR_NAME_RE.test(name);
}

/**
 * Order: ADR → Class B → Class C → Class A → Common.
 */
export function classifyShareClass(input: {
  ticker: string;
  name?: string | null;
  issuerType?: "DOMESTIC" | "FOREIGN" | null;
}): ShareClass {
  const ticker = normTicker(input.ticker);
  const name = String(input.name ?? "");

  if (input.issuerType === "FOREIGN" || isAdrName(name)) return "ADR";

  const suffix = tickerClassSuffix(ticker);
  if (suffix === "B" || CLASS_B_TICKERS.has(ticker) || /\bClass\s*B\b/i.test(name)) {
    return "CLASS_B";
  }
  if (suffix === "C" || CLASS_C_TICKERS.has(ticker) || /\bClass\s*C\b/i.test(name)) {
    return "CLASS_C";
  }
  if (suffix === "A" || CLASS_A_TICKERS.has(ticker) || /\bClass\s*A\b/i.test(name)) {
    return "CLASS_A";
  }
  return "COMMON";
}
