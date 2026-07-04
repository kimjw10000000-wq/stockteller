import { NewsFeedList } from "@/components/news/NewsFeedList";
import { listDisclosuresPaginated } from "@/lib/disclosures";
import type { NewsMarketKey, NewsSortKey } from "@/lib/news-sort";

type FeedListLoaderProps = {
  sort: NewsSortKey;
  market: NewsMarketKey;
  q: string;
};

/** Supabase 조회 — Suspense 경계 안에서만 실행 (페이지 셸은 먼저 스트리밍) */
export async function FeedListLoader({ sort, market, q }: FeedListLoaderProps) {
  const { items, nextCursor } = await listDisclosuresPaginated({
    sort,
    market,
    q: q || undefined,
    limit: 20,
  });

  return (
    <NewsFeedList
      initialItems={items}
      initialCursor={nextCursor}
      sort={sort}
      market={market}
      q={q}
    />
  );
}
