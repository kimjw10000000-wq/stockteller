import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NewsDetailView } from "@/components/news/NewsDetailView";
import { NewsOlderInfiniteList } from "@/components/news/NewsOlderInfiniteList";
import { getDisclosureById, listDisclosuresPaginated } from "@/lib/disclosures";
import { disclosureStockLabel } from "@/lib/news-display";
import { enrichStockMatchContext, getSignalStatusForStockContext } from "@/lib/stock-signal-sync";
import { readStoredSignalStatus, DEFAULT_SIGNAL_STATUS } from "@/lib/signal-status";
import { SITE_NAME_KO } from "@/lib/site";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  const stockContext = enrichStockMatchContext(row);
  // 종목 단위 저장값 읽기 전용 — 재계산·쓰기 없음
  const stockSignal = await getSignalStatusForStockContext(stockContext, row.id);
  const signalStatus = stockSignal ?? readStoredSignalStatus(row) ?? DEFAULT_SIGNAL_STATUS;

  return (
    <main className="space-y-12">
      <NewsDetailView item={row} stockContext={stockContext} signalStatus={signalStatus} />
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
