"use client";

import { memo } from "react";
import { FileWarning } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { NewsCard } from "@/components/news/NewsCard";
import { useFeedRealtime } from "@/hooks/use-feed-realtime";
import { useInfiniteDisclosures } from "@/hooks/use-infinite-disclosures";
import type { DisclosureWithStock } from "@/lib/types";
import type { NewsMarketKey, NewsSortKey } from "@/lib/news-sort";

type NewsFeedListProps = {
  initialItems: DisclosureWithStock[];
  initialCursor: string | null;
  sort: NewsSortKey;
  market: NewsMarketKey;
  q: string;
};

function NewsFeedListInner({
  initialItems,
  initialCursor,
  sort,
  market,
  q,
}: NewsFeedListProps) {
  const { t } = useI18n();
  useFeedRealtime();
  const { items, loading, done, sentinelRef } = useInfiniteDisclosures(
    initialItems,
    initialCursor,
    { sort, market, q: q || undefined }
  );

  if (items.length === 0) {
    return (
      <div
        className="flex flex-col items-center rounded-xl border border-border bg-card px-6 py-12 text-center"
        role="status"
      >
        <FileWarning className="mb-3 h-10 w-10 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-foreground">
          {q ? t("feed.emptyQuery", { q }) : t("feed.empty")}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-y-4 gap-x-12 md:grid-cols-2" role="list">
        {items.map((item, index) => (
          <div key={item.id} role="listitem">
            <NewsCard item={item} lead={index < 2} />
          </div>
        ))}
      </div>
      <div ref={sentinelRef} className="h-4 w-full" aria-hidden />
      {loading ? (
        <p className="mt-4 text-center text-sm text-muted-foreground">{t("feed.loadingMore")}</p>
      ) : null}
      {done && items.length > 0 ? (
        <p className="mt-4 text-center text-xs text-muted-foreground">{t("feed.loadedAll")}</p>
      ) : null}
    </>
  );
}

export const NewsFeedList = memo(NewsFeedListInner);
