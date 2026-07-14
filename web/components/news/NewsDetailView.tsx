import Link from "next/link";
import { ArrowLeft, Clock, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DisclosureWithStock } from "@/lib/types";
import { disclosureStockLabel, disclosureTrend } from "@/lib/news-display";
import { isManualEditorPost, getCoverImageUrl, bodyLooksLikeHtml, bodyIsCanvasLayout } from "@/lib/manual-post";
import { CanvasArticleViewer } from "@/components/news/CanvasArticleViewer";
import { formatNewsDate } from "@/lib/news-sort";
import { InvestDisclaimer } from "@/components/news/InvestDisclaimer";
import { NewsShareModal } from "@/components/news/NewsShareModal";
import { NewsSignalGaugePanel } from "@/components/news/NewsSignalGaugePanel";
import { resolveDisclosureSignalStatus, type SignalStatus } from "@/lib/signal-status";
import { enrichStockMatchContext, type StockMatchContext } from "@/lib/stock-signal-sync";
import { buildShareDescription } from "@/lib/kakao-share";

type NewsDetailViewProps = {
  item: DisclosureWithStock;
  stockContext?: StockMatchContext | null;
  signalStatus?: SignalStatus;
};

export function NewsDetailView({
  item,
  stockContext: stockContextProp,
  signalStatus: signalStatusProp,
}: NewsDetailViewProps) {
  const manual = isManualEditorPost(item);
  const { stock, name } = disclosureStockLabel(item);
  const trend = disclosureTrend(item.sentiment);
  const title = item.title ?? "제목 없음";
  const summaryLines = item.summary?.split("\n").filter((l) => l.trim()) ?? [];
  const cover = getCoverImageUrl(item);
  const stockContext = stockContextProp ?? enrichStockMatchContext(item);
  const signalStatus = signalStatusProp ?? resolveDisclosureSignalStatus(item);

  return (
    <article className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="border-b border-border pb-6">
        <Button variant="ghost" asChild className="-ml-2 mb-4 gap-2">
          <Link href="/feed">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            뉴스 목록으로
          </Link>
        </Button>

        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="font-mono">
            {stock}
          </Badge>
          <span className="text-sm text-muted-foreground">{name}</span>
          {trend === "up" ? (
            <TrendingUp className="h-5 w-5 text-green-500" aria-hidden />
          ) : trend === "down" ? (
            <TrendingDown className="h-5 w-5 text-red-500" aria-hidden />
          ) : null}
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" aria-hidden />
            {formatNewsDate(item.created_at)}
          </span>
        </div>

        <h1 className="text-balance text-3xl font-semibold leading-tight text-foreground">{title}</h1>
        <div className="mt-4">
          <NewsShareModal
            newsId={item.id}
            title={title}
            description={buildShareDescription(item.summary, title)}
            imageUrl={cover}
          />
        </div>
        <NewsSignalGaugePanel
          stockContext={stockContext}
          initialStatus={signalStatus}
          disclosureId={item.id}
        />
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            className="mt-6 max-h-96 w-full rounded-lg object-cover"
          />
        ) : null}
        {item.analysis_score != null ? (
          <p className="mt-3 text-sm text-muted-foreground">AI 점수 {item.analysis_score}</p>
        ) : null}
      </div>

      <section className="mt-8" aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="text-lg font-medium text-foreground">
          {manual ? "미리보기" : "AI 핵심 요약"}
        </h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-foreground/90">
          {(summaryLines.length ? summaryLines : [
            manual ? "목록 카드에 보이는 미리보기입니다." : "요약이 아직 없습니다.",
          ]).map((line, i) => (
            <li key={i} className="leading-relaxed">
              {line}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10" aria-labelledby="raw-heading">
        <h2 id="raw-heading" className="text-lg font-medium text-foreground">
          {manual ? "본문" : "공시 원문 (발췌)"}
        </h2>
        {manual && bodyIsCanvasLayout(item.raw_content) ? (
          <CanvasArticleViewer rawContent={item.raw_content} />
        ) : manual && bodyLooksLikeHtml(item.raw_content) ? (
          <article
            className="article-rich-body mt-3 max-h-[720px] overflow-auto rounded-lg bg-muted/30 p-4 text-sm leading-relaxed text-foreground/90"
            dangerouslySetInnerHTML={{ __html: item.raw_content }}
          />
        ) : (
          <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
            {item.raw_content}
          </pre>
        )}
        <InvestDisclaimer />
      </section>
    </article>
  );
}
