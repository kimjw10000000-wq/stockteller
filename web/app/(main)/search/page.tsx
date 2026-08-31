import type { Metadata } from "next";
import { SearchPageHeader } from "@/components/news/SearchPageHeader";
import { SearchResultsView } from "@/components/news/SearchResultsView";
import { parseWireNewsPage } from "@/lib/gnw/nav";
import { searchWireNewsPage } from "@/lib/gnw/query";
import { uniqueWireNewsTickers } from "@/lib/quotes/format";
import { loadTickerQuotes } from "@/lib/quotes/ticker-quotes";
import { SITE_NAME_KO } from "@/lib/site";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchPageProps = {
  searchParams: { q?: string | string[]; page?: string | string[] };
};

function paramFirst(value: string | string[] | undefined): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return (value[0] ?? "").trim();
  return "";
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const q = paramFirst(searchParams.q);
  if (!q) {
    return {
      title: "검색",
      alternates: { canonical: "/search" },
    };
  }
  return {
    title: `「${q}」 검색 결과`,
    description: `${SITE_NAME_KO}에서 「${q}」 관련 보도자료`,
    alternates: { canonical: `/search?q=${encodeURIComponent(q)}` },
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const q = paramFirst(searchParams.q);
  const page = parseWireNewsPage(searchParams.page);
  const result = q
    ? await searchWireNewsPage(q, page)
    : { items: [], total: 0, page: 1, totalPages: 1 };
  const quotes = await loadTickerQuotes(uniqueWireNewsTickers(result.items));

  return (
    <main className="space-y-6">
      <header>
        <SearchPageHeader q={q} total={result.total} />
      </header>
      <SearchResultsView
        q={q}
        items={result.items}
        page={result.page}
        totalPages={result.totalPages}
        quotes={quotes}
      />
    </main>
  );
}
