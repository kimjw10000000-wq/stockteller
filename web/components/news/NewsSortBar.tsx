"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n/I18nProvider";
import {
  NEWS_MARKET_OPTIONS,
  NEWS_SORT_OPTIONS,
  getDefaultMarketByKst,
  parseMarketKey,
  parseSortKey,
  type NewsMarketKey,
  type NewsSortKey,
} from "@/lib/news-sort";

const SORT_KEYS: Record<NewsSortKey, string> = {
  all_views: "feed.sortViews",
  hour_views: "feed.sortHour",
  latest: "feed.sortLatest",
};

const MARKET_KEYS: Record<Exclude<NewsMarketKey, "all">, string> = {
  us: "feed.marketUs",
  kr: "feed.marketKr",
};

export function NewsSortBar() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const sort = parseSortKey(searchParams.get("sort") ?? undefined);
  const marketParam = searchParams.get("market");
  const market = marketParam ? parseMarketKey(marketParam) : getDefaultMarketByKst();

  function hrefFor(next: { sort?: NewsSortKey; market?: NewsMarketKey }) {
    const params = new URLSearchParams();
    params.set("sort", next.sort ?? sort);
    params.set("market", next.market ?? market);
    return `/feed?${params.toString()}`;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {NEWS_SORT_OPTIONS.map(({ key }) => (
        <Button key={key} type="button" size="sm" variant={sort === key ? "default" : "outline"} asChild>
          <Link href={hrefFor({ sort: key })} prefetch>
            {t(SORT_KEYS[key])}
          </Link>
        </Button>
      ))}
      <span className="mx-1 hidden h-5 w-px bg-border sm:inline" aria-hidden />
      {NEWS_MARKET_OPTIONS.filter((o): o is { key: "us" | "kr"; label: string } => o.key !== "all").map(
        ({ key }) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={market === key ? "default" : "outline"}
            asChild
          >
            <Link href={hrefFor({ market: key })} prefetch>
              {t(MARKET_KEYS[key])}
            </Link>
          </Button>
        )
      )}
    </div>
  );
}
