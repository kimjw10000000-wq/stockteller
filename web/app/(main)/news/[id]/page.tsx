import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NewsDetailView } from "@/components/news/NewsDetailView";
import { NewsOlderInfiniteList } from "@/components/news/NewsOlderInfiniteList";
import { getDisclosureById, listDisclosuresPaginated, incrementDisclosureViewCount } from "@/lib/disclosures";
import { enrichStockMatchContext, getSignalStatusForStockContext } from "@/lib/stock-signal-sync";
import { readStoredSignalStatus, DEFAULT_SIGNAL_STATUS } from "@/lib/signal-status";
import { ensureKoreanShareNames, peekKoreanShareName } from "@/lib/companies/korean-names-client";
import { disclosureStockLabel } from "@/lib/news-display";
import { buildNewsDetailMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: { id: string }; searchParams: { lang?: string | string[] } };

function shareLang(lang: string | string[] | undefined): boolean {
  return (Array.isArray(lang) ? lang[0] : lang) === "ko";
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const row = await getDisclosureById(params.id);
  if (!row) return { title: "뉴스를 찾을 수 없음" };
  let nameKo: string | null = null;
  if (shareLang(searchParams?.lang)) {
    await ensureKoreanShareNames();
    nameKo = peekKoreanShareName(disclosureStockLabel(row).stock) || null;
  }
  return buildNewsDetailMetadata(row, params.id, nameKo, shareLang(searchParams?.lang));
}

export default async function NewsDetailPage({ params }: PageProps) {
  const row = await getDisclosureById(params.id);
  if (!row) notFound();

  void incrementDisclosureViewCount(row.id);

  const { items: olderItems, nextCursor } = await listDisclosuresPaginated({
    sort: "latest",
    market: "all",
    limit: 20,
    cursor: row.created_at,
    excludeId: row.id,
  });

  const stockContext = enrichStockMatchContext(row);
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
