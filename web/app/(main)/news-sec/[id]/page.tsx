import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { T } from "@/components/i18n/T";
import { WireNewsCard } from "@/components/news/WireNewsCard";
import { WireNewsDetailView } from "@/components/news/WireNewsDetailView";
import { loadRelatedWireNews, loadWireNewsById } from "@/lib/gnw/query";
import { tServer } from "@/lib/i18n/server";
import { uniqueWireNewsTickers, wireNewsTicker } from "@/lib/quotes/format";
import { loadTickerQuotes } from "@/lib/quotes/ticker-quotes";
import { buildWireNewsDetailMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: { id: string } };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const item = await loadWireNewsById(params.id);
  if (!item) return { title: tServer("newsSec.notFoundTitle") };
  return buildWireNewsDetailMetadata(item);
}

export default async function WireNewsDetailPage({ params }: PageProps) {
  const item = await loadWireNewsById(params.id);
  if (!item) notFound();

  const related = await loadRelatedWireNews(item, 6);
  const quotes = await loadTickerQuotes(uniqueWireNewsTickers([item, ...related]));

  return (
    <main className="space-y-12">
      <WireNewsDetailView item={item} quote={quotes[wireNewsTicker(item)]} />
      {related.length > 0 ? (
        <section className="border-t border-border pt-10">
          <h2 className="mb-4 text-lg font-medium text-foreground">
            <T k="newsSec.more" />
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {related.map((row) => (
              <WireNewsCard key={row.id} item={row} quote={quotes[wireNewsTicker(row)]} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
