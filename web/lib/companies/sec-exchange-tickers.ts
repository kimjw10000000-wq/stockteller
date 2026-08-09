import { secHeaders } from "@/lib/sec/edgar-client";

const SEC_URL = "https://www.sec.gov/files/company_tickers_exchange.json";

/** Keep major US listing venues for the D-Day search universe. */
const ALLOWED_EXCHANGE = /^(NASDAQ|NYSE)(\s|$|American|Arca|MKT)/i;

export type SecExchangeTicker = {
  ticker: string;
  name: string;
  cik: string;
  exchange: string;
};

type SecPayload = {
  fields?: string[];
  data?: unknown[][];
};

function normalizeExchange(raw: string): string {
  const e = raw.trim();
  if (/^nasdaq/i.test(e)) return "NASDAQ";
  if (/^nyse\s*american/i.test(e) || /^amex/i.test(e)) return "NYSE American";
  if (/^nyse\s*arca/i.test(e)) return "NYSE Arca";
  if (/^nyse/i.test(e)) return "NYSE";
  return e.toUpperCase();
}

export function isUsPrimaryExchange(exchange: string): boolean {
  return ALLOWED_EXCHANGE.test(exchange.trim());
}

/**
 * SEC EDGAR company_tickers_exchange.json
 * @see https://www.sec.gov/os/webmaster-faq#code-support (User-Agent required)
 */
export async function fetchSecExchangeTickers(): Promise<SecExchangeTicker[]> {
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
    if (!isUsPrimaryExchange(exchangeRaw)) continue;
    if (seen.has(ticker)) continue;
    seen.add(ticker);

    const cik = String(cikNum ?? "").replace(/\D/g, "").padStart(10, "0");
    if (cik === "0000000000") continue;

    out.push({
      ticker,
      name,
      cik,
      exchange: normalizeExchange(exchangeRaw),
    });
  }

  return out;
}
