"use client";

import { useEffect, useState } from "react";
import type { TickerQuote, TickerQuoteMap } from "@/lib/quotes/types";

function mergeQuotes(prev: TickerQuoteMap, incoming: TickerQuoteMap): TickerQuoteMap {
  const next: TickerQuoteMap = { ...prev };
  for (const [ticker, quote] of Object.entries(incoming) as [string, TickerQuote][]) {
    const old = prev[ticker];
    next[ticker] = {
      ...quote,
      lastPrice: quote.lastPrice ?? old?.lastPrice ?? null,
      changePct: quote.changePct ?? old?.changePct ?? null,
    };
  }
  return next;
}

export function useTickerQuotes(
  tickers: string[],
  options?: { initial?: TickerQuoteMap; pollMs?: number }
): TickerQuoteMap {
  const key = tickers
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
    .sort()
    .join(",");
  const [quotes, setQuotes] = useState<TickerQuoteMap>(options?.initial ?? {});

  useEffect(() => {
    if (options?.initial) setQuotes(options.initial);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- reset when visible tickers change

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/news-sec/quotes", { cache: "default" });
        if (!res.ok) return;
        const data = (await res.json()) as { quotes?: TickerQuoteMap };
        if (cancelled || !data.quotes || Object.keys(data.quotes).length === 0) return;
        setQuotes((prev) => mergeQuotes(prev, data.quotes as TickerQuoteMap));
      } catch {
        /* keep last */
      }
    };
    void load();
    const iv = setInterval(() => void load(), options?.pollMs ?? 1_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [key, options?.pollMs]);

  return quotes;
}
