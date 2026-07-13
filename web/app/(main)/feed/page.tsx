import { Suspense } from "react";
import { redirect } from "next/navigation";
import { FeedPageHeader } from "@/components/news/FeedPageHeader";
import { FeedGridSkeleton } from "@/components/news/FeedSkeleton";
import { FeedListLoader } from "@/components/news/FeedListLoader";
import { getDefaultMarketByKst, parseMarketKey, parseSortKey } from "@/lib/news-sort";
import type { Metadata } from "next";
import { SITE_NAME_EN, SITE_NAME_KO, SITE_TAGLINE } from "@/lib/site";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

export default function FeedPage({ searchParams }: FeedPageProps) {
  const sort = parseSortKey(paramFirst(searchParams.sort) || undefined);
  const marketParam = paramFirst(searchParams.market);
  const q = paramFirst(searchParams.q);

  // market 미지정 시 KST 기준(09:00~16:00 한국장 / 그 외 미국장)으로 URL 고정
  if (!marketParam) {
    const params = new URLSearchParams();
    params.set("sort", sort);
    params.set("market", getDefaultMarketByKst());
    if (q) params.set("q", q);
    redirect(`/feed?${params.toString()}`);
  }

  const market = parseMarketKey(marketParam);

  return (
    <main className="space-y-6">
      <FeedPageHeader q={q} />
      <Suspense fallback={<FeedGridSkeleton />}>
        <FeedListLoader sort={sort} market={market} q={q} />
      </Suspense>
    </main>
  );
}
