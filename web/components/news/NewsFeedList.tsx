"use client";

import { FileWarning } from "lucide-react";
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

export function NewsFeedList({
  initialItems,
  initialCursor,
  sort,
  market,
  q,
}: NewsFeedListProps) {
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
          {q ? `「${q}」에 맞는 뉴스가 없습니다.` : "아직 표시할 뉴스가 없습니다."}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2" role="list">
        {items.map((item) => (
          <div key={item.id} role="listitem">
            <NewsCard item={item} />
          </div>
        ))}
      </div>
      <div ref={sentinelRef} className="h-4 w-full" aria-hidden />
      {loading ? (
        <p className="mt-4 text-center text-sm text-muted-foreground">더 불러오는 중…</p>
      ) : null}
      {done && items.length > 0 ? (
        <p className="mt-4 text-center text-xs text-muted-foreground">모든 뉴스를 불러왔습니다.</p>
      ) : null}
    </>
  );
}
