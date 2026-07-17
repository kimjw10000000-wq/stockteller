import type { Metadata } from "next";
import { SearchResultsView } from "@/components/news/SearchResultsView";
import { searchDisclosures } from "@/lib/disclosures";
import { SITE_NAME_KO } from "@/lib/site";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchPageProps = {
  searchParams: { q?: string | string[] };
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
    description: `${SITE_NAME_KO}에서 「${q}」 분석글 검색 결과`,
    alternates: { canonical: `/search?q=${encodeURIComponent(q)}` },
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const q = paramFirst(searchParams.q);
  const { items, total } = q ? await searchDisclosures(q) : { items: [], total: 0 };

  return (
    <main className="space-y-6">
      <header>
        {q ? (
          <h1 className="text-xl font-semibold text-foreground">
            「{q}」에 대한 검색 결과
            <span className="ml-2 text-base font-normal text-muted-foreground">
              (총 {total}건)
            </span>
          </h1>
        ) : (
          <h1 className="text-xl font-semibold text-foreground">검색</h1>
        )}
      </header>
      <SearchResultsView q={q} items={items} total={total} />
    </main>
  );
}
