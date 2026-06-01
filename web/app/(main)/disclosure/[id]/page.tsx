import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NewsDetailView } from "@/components/news/NewsDetailView";
import { NewsOlderInfiniteList } from "@/components/news/NewsOlderInfiniteList";
import { getDisclosureById, listDisclosuresPaginated } from "@/lib/disclosures";
import { disclosureStockLabel } from "@/lib/news-display";
import { SITE_NAME_KO } from "@/lib/site";

type PageProps = { params: { id: string } };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const row = await getDisclosureById(params.id);
  if (!row) return { title: "뉴스를 찾을 수 없음" };
  const { name } = disclosureStockLabel(row);
  const title = row.title ?? "뉴스";
  const description = row.summary?.split("\n").filter(Boolean).slice(0, 2).join(" ") ?? "";
  return {
    title: `${name} — ${title}`,
    description: description || `${name} · ${SITE_NAME_KO}`,
    alternates: { canonical: `/disclosure/${params.id}` },
    openGraph: { title: `${name} — ${title}`, description },
  };
}

export default async function DisclosureDetailPage({ params }: PageProps) {
  const row = await getDisclosureById(params.id);
  if (!row) notFound();

  const { items: olderItems, nextCursor } = await listDisclosuresPaginated({
    sort: "latest",
    market: "all",
    limit: 20,
    cursor: row.created_at,
    excludeId: row.id,
  });

  return (
    <main className="space-y-12">
      <NewsDetailView item={row} />
      <section className="border-t border-border pt-10">
        <NewsOlderInfiniteList
          currentId={row.id}
          initialItems={olderItems}
          initialCursor={nextCursor}
        />
      </section>
    </main>
  );
}
