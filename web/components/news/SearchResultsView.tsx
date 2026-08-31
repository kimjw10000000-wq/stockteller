"use client";

import { FileSearch, SearchX } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { WireNewsCard } from "@/components/news/WireNewsCard";
import { WireNewsPager } from "@/components/news/WireNewsPager";
import { useTickerQuotes } from "@/hooks/use-ticker-quotes";
import type { WireNewsRow } from "@/lib/gnw/types";
import { searchNewsHref } from "@/lib/gnw/nav";
import { uniqueWireNewsTickers, wireNewsTicker } from "@/lib/quotes/format";
import type { TickerQuoteMap } from "@/lib/quotes/types";

type SearchResultsViewProps = {
  q: string;
  items: WireNewsRow[];
  page: number;
  totalPages: number;
  quotes?: TickerQuoteMap;
};

export function SearchResultsView({
  q,
  items,
  page,
  totalPages,
  quotes: initialQuotes,
}: SearchResultsViewProps) {
  const { t } = useI18n();
  const quotes = useTickerQuotes(uniqueWireNewsTickers(items), {
    initial: initialQuotes,
    pollMs: 1_000,
  });

  if (!q) {
    return (
      <div
        className="flex flex-col items-center rounded-xl border border-border bg-card px-6 py-16 text-center"
        role="status"
      >
        <FileSearch className="mb-4 h-12 w-12 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-foreground">{t("search.promptTitle")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("search.promptHint")}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className="flex flex-col items-center rounded-xl border border-border bg-card px-6 py-16 text-center"
        role="status"
      >
        <SearchX className="mb-4 h-12 w-12 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-foreground">{t("search.emptyTitle", { q })}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("search.emptyHint")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2" role="list">
        {items.map((item) => (
          <div key={item.id} role="listitem">
            <WireNewsCard item={item} quote={quotes[wireNewsTicker(item)]} />
          </div>
        ))}
      </div>
      <WireNewsPager
        page={page}
        totalPages={totalPages}
        hrefForPage={(n) => searchNewsHref(q, n)}
      />
    </>
  );
}
