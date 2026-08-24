import { secHeaders } from "@/lib/sec/edgar-client";
import {
  isSearchListedExchange,
  type ListedExchange,
  type SecListingRow,
} from "./listing-diff";

const SEC_URL = "https://www.sec.gov/files/company_tickers_exchange.json";

export type SecExchangeTicker = SecListingRow;

type SecPayload = {
  fields?: string[];
  data?: unknown[][];
};

export function normalizeExchange(raw: string): ListedExchange {
  const e = raw.trim();
  if (/^nasdaq/i.test(e)) return "NASDAQ";
  if (/^nyse\s*american/i.test(e) || /^amex/i.test(e) || /^nyse\s*mkt/i.test(e)) {
    return "AMEX";
  }
  if (/^nyse/i.test(e)) return "NYSE";
  if (/^otc/i.test(e) || /^pink/i.test(e) || /^expert/i.test(e)) return "OTC";
  return "OTHER";
}

export function isUsPrimaryExchange(exchange: string): boolean {
  return isSearchListedExchange(normalizeExchange(exchange));
}

/**
 * SEC EDGAR company_tickers_exchange.json
 * @see https://www.sec.gov/os/webmaster-faq#code-support (User-Agent required)
 */
export async function fetchSecExchangeTickers(opts?: {
  listedOnly?: boolean;
}): Promise<SecExchangeTicker[]> {
  const listedOnly = opts?.listedOnly !== false;
  const res = await fetch(SEC_URL, {
    headers: secHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`SEC company_tickers_exchange ${res.status}`);
  }

  const json = (await res.json()) as SecPayload;
  const fields = (json.fields ?? []).map((f) => String(f).toLowerCase());
  const cikIdx = fields.indexOf("cik");
  const nameIdx = fields.indexOf("name");
  const tickerIdx = fields.indexOf("ticker");
  const exchangeIdx = fields.indexOf("exchange");
  if (cikIdx < 0 || nameIdx < 0 || tickerIdx < 0 || exchangeIdx < 0) {
    throw new Error("SEC company_tickers_exchange: unexpected fields");
  }

  const out: SecExchangeTicker[] = [];
  const seen = new Set<string>();

  for (const row of json.data ?? []) {
    if (!Array.isArray(row)) continue;
    const ticker = String(row[tickerIdx] ?? "")
      .trim()
      .toUpperCase()
      .replace(/\./g, "-");
    const name = String(row[nameIdx] ?? "").trim();
    const exchangeRaw = String(row[exchangeIdx] ?? "").trim();
    const cikNum = row[cikIdx];
    if (!ticker || !name || !exchangeRaw) continue;
    const exchange = normalizeExchange(exchangeRaw);
    if (listedOnly && !isSearchListedExchange(exchange)) continue;
    if (seen.has(ticker)) continue;
    seen.add(ticker);

    const cik = String(cikNum ?? "").replace(/\D/g, "").padStart(10, "0");
    if (cik === "0000000000") continue;

    out.push({ ticker, name, cik, exchange });
  }

  return out;
}
