import Link from "next/link";
import { ArrowLeft, Clock, ExternalLink, TrendingDown, TrendingUp } from "lucide-react";
import { LocalizedDate } from "@/components/i18n/LocalizedDate";
import { T } from "@/components/i18n/T";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProtectedContent } from "@/components/security/ProtectedContent";
import { NewsShareModal } from "@/components/news/NewsShareModal";
import { QuoteChangePct } from "@/components/news/QuoteChangePct";
import { buildShareDescription, getWireNewsShareUrl } from "@/lib/kakao-share";
import { wireNewsAffiliation, type WireNewsRow } from "@/lib/gnw/types";
import { disclosureTrend } from "@/lib/news-display";
import { resolveNewsWireLabel, summaryHasNewswireAttribution } from "@/lib/sec/listed-newswires";
import type { TickerQuote } from "@/lib/quotes/types";
import type { Sentiment } from "@/lib/types";

const SENTIMENTS: Sentiment[] = ["positive", "negative", "neutral"];

export function wireNewsTicker(item: WireNewsRow): string {
  return item.primary_ticker || item.tickers?.[0] || "—";
}

export function wireNewsBody(item: WireNewsRow): string {
  return item.summary?.trim() || item.teaser?.trim() || "";
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
  const affiliation = wireNewsAffiliation(item);
  const wireLabel = resolveNewsWireLabel(item);
  const showAttribution =
    affiliation === "news" && Boolean(wireLabel) && !summaryHasNewswireAttribution(body, wireLabel);

  return (
    <article className="mx-auto max-w-4xl rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <header className="border-b border-border pb-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Button variant="ghost" asChild className="-ml-2 gap-2">
            <Link href="/news-sec" prefetch>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              <T k="newsSec.backToList" />
            </Link>
          </Button>
          <NewsShareModal
            url={getWireNewsShareUrl(item.id)}
            title={item.title}
            description={buildShareDescription(item.teaser || item.summary, item.title)}
          />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="font-mono">
            {ticker}
          </Badge>
          <Badge variant={affiliation === "sec" ? "outline" : "default"}>
            {affiliation === "sec" ? (
              <T k="newsSec.affiliationSec" />
            ) : (
              <T k="newsSec.affiliationNews" />
            )}
          </Badge>
          {wireLabel ? (
            <Badge variant="outline" className="font-normal">
              {wireLabel}
            </Badge>
          ) : null}
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
          {affiliation === "sec" ? (
            <T k="newsSec.secSourceLabel" />
          ) : wireLabel ? (
            <T k="newsSec.distributedBy" values={{ wire: wireLabel }} />
          ) : (
            <T k="newsSec.newsSourceLabel" />
          )}
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
          {showAttribution ? (
            <p className="mt-5 text-sm leading-[1.8] text-muted-foreground">
              <T k="newsSec.wireAttribution" values={{ wire: wireLabel ?? "" }} />
            </p>
          ) : null}
        </section>

        {item.source === "globenewswire" && (item.original_title || item.original_teaser || item.original_summary) ? (
          <section className="mt-10 border-t border-border pt-8" aria-labelledby="wire-original-heading">
            <h2 id="wire-original-heading" className="text-lg font-medium text-foreground">
              <T k="newsSec.originalRss" />
            </h2>
            {item.original_title ? (
              <p className="mt-4 font-medium leading-snug text-foreground">{item.original_title}</p>
            ) : null}
            {(item.original_teaser || item.original_summary) ? (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-[1.8] text-muted-foreground">
                {item.original_teaser?.trim() || item.original_summary}
              </p>
            ) : null}
          </section>
        ) : null}

        <p className="mt-10 border-t border-border pt-6">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            {(item.source === "edgar-6k" || item.source === "edgar-8k") && affiliation === "news" ? (
              <T k="newsSec.openExhibit99" />
            ) : affiliation === "sec" ? (
              <T k="newsSec.openSec" />
            ) : (
              <T k="newsSec.openOriginal" />
            )}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </p>
      </ProtectedContent>
    </article>
  );
}
