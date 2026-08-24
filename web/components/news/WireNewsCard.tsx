"use client";

import { Clock, ExternalLink, TrendingDown, TrendingUp } from "lucide-react";
import { LocalizedDate } from "@/components/i18n/LocalizedDate";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ProtectedContent } from "@/components/security/ProtectedContent";
import type { WireNewsRow } from "@/lib/gnw/types";
import { disclosureTrend } from "@/lib/news-display";

export function WireNewsCard({ item }: { item: WireNewsRow }) {
  const { t } = useI18n();
  const ticker = item.primary_ticker || item.tickers[0] || "—";
  const trend = disclosureTrend(item.sentiment);
  const preview = item.summary?.split("\n").filter(Boolean)[0] ?? "";
  const when = item.published_at || item.created_at;
  const capLabel =
    item.cap_bucket === "nano"
      ? t("newsSec.nano")
      : item.cap_bucket === "micro"
        ? t("newsSec.micro")
        : null;

  return (
    <ProtectedContent className="h-full" blockContextMenu={false}>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block h-full"
      >
        <Card className="h-full cursor-pointer gap-0 overflow-hidden p-0 transition-all hover:border-primary/50 hover:shadow-md">
          <div className="p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-mono">
                {ticker}
              </Badge>
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
            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Clock className="h-3 w-3 shrink-0" aria-hidden />
                {when ? <LocalizedDate iso={when} /> : null}
              </span>
              <span className="inline-flex items-center gap-1">
                {t("newsSec.original")}
                <ExternalLink className="h-3 w-3" aria-hidden />
              </span>
            </div>
          </div>
        </Card>
      </a>
    </ProtectedContent>
  );
}
