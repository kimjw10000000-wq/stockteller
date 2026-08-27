"use client";

import { useEffect, useState } from "react";
import type { TickerQuoteMap } from "@/lib/quotes/types";

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
        if (!cancelled && data.quotes) setQuotes(data.quotes);
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
