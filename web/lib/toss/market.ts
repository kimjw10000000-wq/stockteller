import { tossFetch } from "./client";

export type TossPrice = {
  symbol: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
  currency: string | null;
  raw: unknown;
};

export type TossCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function asArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const key of ["result", "prices", "data", "items"]) {
      const v = o[key];
      if (Array.isArray(v)) return v;
      if (v && typeof v === "object") {
        const inner = v as Record<string, unknown>;
        for (const k2 of ["result", "prices", "items", "list"]) {
          if (Array.isArray(inner[k2])) return inner[k2] as unknown[];
        }
      }
    }
  }
  return [];
}

function pickSymbol(row: Record<string, unknown>): string {
  return String(row.symbol ?? row.stockCode ?? row.code ?? "").trim();
}

export function normalizeTossPrice(row: unknown): TossPrice | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const symbol = pickSymbol(r);
  if (!symbol) return null;

  const price =
    num(r.price) ??
    num(r.close) ??
    num(r.last) ??
    num(r.lastPrice) ??
    num(r.base) ??
    num(r.tradePrice);

  const change = num(r.change) ?? num(r.changePrice) ?? num(r.diff);
  const changePct =
    num(r.changeRate) ?? num(r.changePct) ?? num(r.changePercent) ?? num(r.fluctuationRate);
  const volume = num(r.volume) ?? num(r.accVolume) ?? num(r.tradeVolume);
  const currency =
    typeof r.currency === "string"
      ? r.currency
      : typeof r.currencyCode === "string"
        ? r.currencyCode
        : null;

  return { symbol, price, change, changePct, volume, currency, raw: row };
}

export async function fetchTossPrices(symbols: string[]): Promise<TossPrice[]> {
  const list = symbols.map((s) => s.trim()).filter(Boolean).slice(0, 200);
  if (!list.length) return [];

  const data = await tossFetch<unknown>("/api/v1/prices", {
    searchParams: { symbols: list.join(",") },
  });

  return asArray(data)
    .map(normalizeTossPrice)
    .filter((x): x is TossPrice => x != null);
}

function normalizeCandle(row: unknown): TossCandle | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const open = num(r.open) ?? num(r.openPrice) ?? num(r.o);
  const high = num(r.high) ?? num(r.highPrice) ?? num(r.h);
  const low = num(r.low) ?? num(r.lowPrice) ?? num(r.l);
  const close = num(r.close) ?? num(r.closePrice) ?? num(r.c);
  if (open == null || high == null || low == null || close == null) return null;

  const time = String(
    r.datetime ?? r.dateTime ?? r.timestamp ?? r.time ?? r.t ?? r.date ?? ""
  ).trim();
  return {
    time,
    open,
    high,
    low,
    close,
    volume: num(r.volume) ?? num(r.v),
  };
}

export async function fetchTossCandles(
  symbol: string,
  interval: "1m" | "1d" = "1d",
  count = 60
): Promise<TossCandle[]> {
  const data = await tossFetch<unknown>("/api/v1/candles", {
    searchParams: {
      symbol: symbol.trim(),
      interval,
      count: String(Math.min(Math.max(count, 1), 200)),
    },
  });

  let rows: unknown[] = [];
  if (Array.isArray(data)) rows = data;
  else if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.candles)) rows = o.candles;
    else if (Array.isArray(o.result)) rows = o.result;
    else if (o.result && typeof o.result === "object") {
      const inner = o.result as Record<string, unknown>;
      if (Array.isArray(inner.candles)) rows = inner.candles;
    }
  }

  const candles = rows
    .map(normalizeCandle)
    .filter((x): x is TossCandle => x != null)
    .reverse(); // API often newest-first

  return candles;
}
