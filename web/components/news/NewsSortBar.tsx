"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { cn } from "@/lib/utils";

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
    <div className="flex flex-wrap items-center gap-2.5">
      {NEWS_SORT_OPTIONS.map(({ key }) => (
        <Link
          key={key}
          href={hrefFor({ sort: key })}
          prefetch
          className={cn("feed-neo-pill", sort === key && "feed-neo-pill-active")}
        >
          {t(SORT_KEYS[key])}
        </Link>
      ))}
      {NEWS_MARKET_OPTIONS.filter((o): o is { key: "us" | "kr"; label: string } => o.key !== "all").map(
        ({ key }) => (
          <Link
            key={key}
            href={hrefFor({ market: key })}
            prefetch
            className={cn("feed-neo-pill", market === key && "feed-neo-pill-active")}
          >
            {t(MARKET_KEYS[key])}
          </Link>
        )
      )}
    </div>
  );
}
