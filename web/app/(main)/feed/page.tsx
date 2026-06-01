import type { Metadata } from "next";
import { Suspense } from "react";
import { NewsFeedGrid } from "@/components/news/NewsFeedGrid";
import { listDisclosuresPaginated } from "@/lib/disclosures";
import { parseMarketKey, parseSortKey } from "@/lib/news-sort";
import { SITE_NAME_EN, SITE_NAME_KO, SITE_TAGLINE } from "@/lib/site";

export const metadata: Metadata = {
  title: "뉴스",
  description: `${SITE_NAME_KO}(${SITE_NAME_EN}) — AI가 정리한 뉴스·공시 요약`,
  alternates: { canonical: "/feed" },
  openGraph: {
    title: `뉴스 · ${SITE_NAME_KO}`,
    description: SITE_TAGLINE,
  },
};

type FeedPageProps = {
  searchParams: { q?: string | string[]; sort?: string | string[]; market?: string | string[] };
};

function paramFirst(value: string | string[] | undefined): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return (value[0] ?? "").trim();
  return "";
}

export default async function FeedPage({ searchParams }: FeedPageProps) {
  const sort = parseSortKey(paramFirst(searchParams.sort) || undefined);
  const market = parseMarketKey(paramFirst(searchParams.market) || undefined);
  const q = paramFirst(searchParams.q);

  const { items, nextCursor } = await listDisclosuresPaginated({
    sort,
    market,
    q: q || undefined,
    limit: 20,
  });

  return (
    <main>
      <Suspense
        fallback={
          <div className="space-y-4">
            <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-36 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          </div>
        }
      >
        <NewsFeedGrid
          initialItems={items}
          initialCursor={nextCursor}
          sort={sort}
          market={market}
          q={q}
        />
      </Suspense>
    </main>
  );
}
