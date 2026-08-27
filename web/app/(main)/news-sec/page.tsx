import type { Metadata } from "next";
import { NewsSecContent } from "@/components/news/NewsSecContent";
import { loadWireNewsPage, parseWireNewsPage } from "@/lib/gnw/query";
import { uniqueWireNewsTickers } from "@/lib/quotes/format";
import { loadTickerQuotes } from "@/lib/quotes/ticker-quotes";
import { SITE_NAME_KO } from "@/lib/site";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "News/SEC",
  description: `${SITE_NAME_KO} — 미국 상장·OTC GlobeNewswire 최신 보도자료`,
  alternates: { canonical: "/news-sec" },
};

type PageProps = { searchParams: { page?: string } };

export default async function NewsSecPage({ searchParams }: PageProps) {
  const result = await loadWireNewsPage(parseWireNewsPage(searchParams.page));
  const quotes = await loadTickerQuotes(uniqueWireNewsTickers(result.items));
  return (
    <NewsSecContent
      items={result.items}
      page={result.page}
      totalPages={result.totalPages}
      quotes={quotes}
    />
  );
}
