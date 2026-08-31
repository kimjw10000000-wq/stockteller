import Link from "next/link";
import { ArrowLeft, Clock, ExternalLink, TrendingDown, TrendingUp } from "lucide-react";
import { LocalizedDate } from "@/components/i18n/LocalizedDate";
import { T } from "@/components/i18n/T";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProtectedContent } from "@/components/security/ProtectedContent";
import { QuoteChangePct } from "@/components/news/QuoteChangePct";
import type { WireNewsRow } from "@/lib/gnw/types";
import { disclosureTrend } from "@/lib/news-display";
import type { TickerQuote } from "@/lib/quotes/types";
import type { Sentiment } from "@/lib/types";

const SENTIMENTS: Sentiment[] = ["positive", "negative", "neutral"];

export function wireNewsTicker(item: WireNewsRow): string {
  return item.primary_ticker || item.tickers?.[0] || "—";
}

export function wireNewsBody(item: WireNewsRow): string {
  return (item.teaser?.trim() || item.summary?.trim() || "");
}

export function WireNewsDetailView({
  item,
  quote,
}: {
  item: WireNewsRow;
  quote?: TickerQuote | null;
}) {
  const ticker = wireNewsTicker(item);
  const sentiment = SENTIMENTS.includes(item.sentiment as Sentiment)
    ? (item.sentiment as Sentiment)
    : null;
  const trend = sentiment ? disclosureTrend(sentiment) : null;
  const when = item.published_at || item.created_at;
  const body = wireNewsBody(item);
  const paragraphs = body.split(/\n+/).map((p) => p.trim()).filter(Boolean);

  return (
    <article className="mx-auto max-w-4xl rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <header className="border-b border-border pb-6">
        <Button variant="ghost" asChild className="-ml-2 mb-4 gap-2">
          <Link href="/news-sec" prefetch>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            <T k="newsSec.backToList" />
          </Link>
        </Button>

        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="font-mono">
            {ticker}
          </Badge>
          <QuoteChangePct changePct={quote?.changePct} lastPrice={quote?.lastPrice} />
          {item.company_name ? (
            <span className="text-sm text-muted-foreground">{item.company_name}</span>
          ) : null}
          {item.cap_bucket === "nano" ? (
            <Badge variant="outline">
              <T k="newsSec.nano" />
            </Badge>
          ) : item.cap_bucket === "micro" ? (
            <Badge variant="outline">
              <T k="newsSec.micro" />
            </Badge>
          ) : null}
          {trend === "up" ? (
            <TrendingUp className="h-5 w-5 text-green-500" aria-hidden />
          ) : trend === "down" ? (
            <TrendingDown className="h-5 w-5 text-red-500" aria-hidden />
          ) : null}
          {when ? (
            <time dateTime={when} className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" aria-hidden />
              <LocalizedDate iso={when} />
            </time>
          ) : null}
        </div>

        <h1 className="text-balance text-3xl font-semibold leading-tight text-foreground">{item.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          <T k="newsSec.sourceLabel" />
        </p>
      </header>

      <ProtectedContent>
        <section className="mt-8" aria-labelledby="wire-body-heading">
          <h2 id="wire-body-heading" className="text-lg font-medium text-foreground">
            <T k="newsSec.body" />
          </h2>
          {paragraphs.length ? (
            <div className="mt-4 space-y-5 text-base leading-[1.8] text-foreground">
              {paragraphs.map((p, i) => (
                <p key={i} className="whitespace-pre-wrap">
                  {p}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-4 leading-relaxed text-muted-foreground">
              <T k="newsSec.noBody" />
            </p>
          )}
        </section>

        <p className="mt-10 border-t border-border pt-6">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            <T k="newsSec.openOriginal" />
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </p>
      </ProtectedContent>
    </article>
  );
}
