"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  NEWS_MARKET_OPTIONS,
  NEWS_SORT_OPTIONS,
  getDefaultMarketByKst,
  parseMarketKey,
  parseSortKey,
  type NewsMarketKey,
  type NewsSortKey,
} from "@/lib/news-sort";

export function NewsSortBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sort = parseSortKey(searchParams.get("sort") ?? undefined);
  const marketParam = searchParams.get("market");
  const market = marketParam ? parseMarketKey(marketParam) : getDefaultMarketByKst();

  const setParams = useCallback(
    (next: { sort?: NewsSortKey; market?: NewsMarketKey }) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("sort", next.sort ?? sort);
      params.set("market", next.market ?? market);
      const q = searchParams.get("q");
      if (q) params.set("q", q);
      else params.delete("q");
      router.push(`/feed?${params.toString()}`);
    },
    [router, searchParams, sort, market]
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {NEWS_SORT_OPTIONS.map(({ key, label }) => (
        <Button
          key={key}
          type="button"
          size="sm"
          variant={sort === key ? "default" : "outline"}
          onClick={() => setParams({ sort: key })}
        >
          {label}
        </Button>
      ))}
      <span className="mx-1 hidden h-5 w-px bg-border sm:inline" aria-hidden />
      {NEWS_MARKET_OPTIONS.filter((o) => o.key !== "all").map(({ key, label }) => (
        <Button
          key={key}
          type="button"
          size="sm"
          variant={market === key ? "default" : "outline"}
          onClick={() => setParams({ market: key })}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
