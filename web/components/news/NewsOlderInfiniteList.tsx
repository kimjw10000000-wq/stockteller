"use client";

import { NewsCard } from "@/components/news/NewsCard";
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
      <p className="text-sm text-muted-foreground">이전 뉴스가 없습니다.</p>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">이전 뉴스</h2>
      <div className="grid gap-4 md:grid-cols-2" role="list">
        {items.map((item) => (
          <div key={item.id} role="listitem">
            <NewsCard item={item} />
          </div>
        ))}
      </div>
      <div ref={sentinelRef} className="h-4" aria-hidden />
      {loading ? (
        <p className="text-center text-sm text-muted-foreground">더 불러오는 중…</p>
      ) : null}
      {done && items.length > 0 ? (
        <p className="text-center text-xs text-muted-foreground">이전 뉴스를 모두 불러왔습니다.</p>
      ) : null}
    </div>
  );
}
