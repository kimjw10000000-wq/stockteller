"use client";

import { NewsCard } from "@/components/news/NewsCard";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useInfiniteDisclosures } from "@/hooks/use-infinite-disclosures";
import type { DisclosureWithStock } from "@/lib/types";

type NewsOlderInfiniteListProps = {
  currentId: string;
  initialItems: DisclosureWithStock[];
  initialCursor: string | null;
};

export function NewsOlderInfiniteList({
  currentId,
  initialItems,
  initialCursor,
}: NewsOlderInfiniteListProps) {
  const { t } = useI18n();
  const { items, loading, done, sentinelRef } = useInfiniteDisclosures(
    initialItems,
    initialCursor,
    {
      sort: "latest",
      market: "all",
      excludeId: currentId,
    }
  );

  if (items.length === 0 && !loading) {
    return (
      <p className="text-sm text-muted-foreground">{t("news.olderEmpty")}</p>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">{t("news.olderTitle")}</h2>
      <div className="grid gap-y-4 gap-x-12 md:grid-cols-2" role="list">
        {items.map((item) => (
          <div key={item.id} role="listitem">
            <NewsCard item={item} />
          </div>
        ))}
      </div>
      <div ref={sentinelRef} className="h-4" aria-hidden />
      {loading ? (
        <p className="text-center text-sm text-muted-foreground">{t("news.olderLoading")}</p>
      ) : null}
      {done && items.length > 0 ? (
        <p className="text-center text-xs text-muted-foreground">{t("news.olderDone")}</p>
      ) : null}
    </div>
  );
}
