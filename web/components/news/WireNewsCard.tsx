"use client";

import Link from "next/link";
import { Clock, TrendingDown, TrendingUp } from "lucide-react";
import { LocalizedDate } from "@/components/i18n/LocalizedDate";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ProtectedContent } from "@/components/security/ProtectedContent";
import { QuoteChangePct } from "@/components/news/QuoteChangePct";
import { wireNewsAffiliation, type WireNewsRow } from "@/lib/gnw/types";
import { disclosureTrend } from "@/lib/news-display";
import type { TickerQuote } from "@/lib/quotes/types";
import type { Sentiment } from "@/lib/types";

const SENTIMENTS: Sentiment[] = ["positive", "negative", "neutral"];

export function WireNewsCard({
  item,
  quote,
}: {
  item: WireNewsRow;
  quote?: TickerQuote | null;
}) {
  const { t } = useI18n();
  const ticker = item.primary_ticker || item.tickers?.[0] || "—";
  const sentiment = SENTIMENTS.includes(item.sentiment as Sentiment)
    ? (item.sentiment as Sentiment)
    : null;
  const trend = sentiment ? disclosureTrend(sentiment) : null;
  const preview =
    (item.teaser && item.teaser.trim()) ||
    item.summary?.split("\n").filter(Boolean)[0] ||
    "";
  const when = item.published_at || item.created_at;
  const affiliation = wireNewsAffiliation(item);
  const capLabel =
    item.cap_bucket === "nano"
      ? t("newsSec.nano")
      : item.cap_bucket === "micro"
        ? t("newsSec.micro")
        : null;

  return (
    <ProtectedContent className="h-full" blockContextMenu={false}>
      <Link href={`/news-sec/${item.id}`} prefetch className="block h-full">
        <Card className="h-full cursor-pointer gap-0 overflow-hidden p-0 transition-all hover:border-primary/50 hover:shadow-md">
          <div className="p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-mono">
                {ticker}
              </Badge>
              <Badge variant={affiliation === "sec" ? "outline" : "default"}>
                {affiliation === "sec" ? t("newsSec.affiliationSec") : t("newsSec.affiliationNews")}
              </Badge>
              {item.newswire?.trim() ? (
                <Badge variant="outline" className="font-normal">
                  {item.newswire.trim()}
                </Badge>
              ) : null}
              <QuoteChangePct changePct={quote?.changePct} lastPrice={quote?.lastPrice} />
              {capLabel ? (
                <Badge variant="outline">{capLabel}</Badge>
              ) : null}
              {trend === "up" ? (
                <TrendingUp className="h-4 w-4 shrink-0 text-green-500" aria-label={t("news.trendUp")} />
              ) : trend === "down" ? (
                <TrendingDown className="h-4 w-4 shrink-0 text-red-500" aria-label={t("news.trendDown")} />
              ) : null}
            </div>
            <h3 className="mb-2 font-medium leading-snug text-foreground">{item.title}</h3>
            {preview ? (
              <p className="mb-2 line-clamp-2 text-sm text-muted-foreground">{preview}</p>
            ) : null}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" aria-hidden />
              {when ? <LocalizedDate iso={when} /> : null}
            </div>
          </div>
        </Card>
      </Link>
    </ProtectedContent>
  );
}
