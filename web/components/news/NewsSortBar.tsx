"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  NEWS_MARKET_OPTIONS,
  NEWS_SORT_OPTIONS,
  parseMarketKey,
  parseSortKey,
  type NewsMarketKey,
  type NewsSortKey,
} from "@/lib/news-sort";

export function NewsSortBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sort = parseSortKey(searchParams.get("sort") ?? undefined);
  const market = parseMarketKey(searchParams.get("market") ?? undefined);

  const setParams = useCallback(
    (next: { sort?: NewsSortKey; market?: NewsMarketKey }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.sort) params.set("sort", next.sort);
      if (next.market) params.set("market", next.market);
      router.push(`/feed?${params.toString()}`);
    },
    [router, searchParams]
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
