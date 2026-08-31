import type { Metadata } from "next";
import { NewsSecContent } from "@/components/news/NewsSecContent";
import { parseWireNewsFilter, parseWireNewsPage } from "@/lib/gnw/nav";
import { loadWireNewsMoversPage, loadWireNewsPage } from "@/lib/gnw/query";
import { uniqueWireNewsTickers } from "@/lib/quotes/format";
import { loadTickerQuotes } from "@/lib/quotes/ticker-quotes";
import { SITE_NAME_KO } from "@/lib/site";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "News/SEC",
  description: `${SITE_NAME_KO} — 미국 상장·OTC 통신사 뉴스와 SEC 6-K 요약`,
  alternates: { canonical: "/news-sec" },
};

type PageProps = { searchParams: { page?: string; filter?: string } };

export default async function NewsSecPage({ searchParams }: PageProps) {
  const filter = parseWireNewsFilter(searchParams.filter);
  const page = parseWireNewsPage(searchParams.page);
  const result =
    filter === "latest"
      ? await loadWireNewsPage(page)
      : await loadWireNewsMoversPage(page, filter);
  const quotes = await loadTickerQuotes(uniqueWireNewsTickers(result.items));
  return (
    <NewsSecContent
      items={result.items}
      page={result.page}
      totalPages={result.totalPages}
      quotes={quotes}
      filter={filter}
    />
  );
}
