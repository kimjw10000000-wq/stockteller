"use client";

import { memo } from "react";
import Link from "next/link";
import { Clock, TrendingDown, TrendingUp } from "lucide-react";
import { LocalizedDate } from "@/components/i18n/LocalizedDate";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { DisclosureWithStock } from "@/lib/types";
import { disclosureStockLabel, disclosureTrend } from "@/lib/news-display";
import { getCoverImageUrl } from "@/lib/manual-post";
import { ProtectedContent } from "@/components/security/ProtectedContent";

type NewsCardProps = {
  item: DisclosureWithStock;
  lead?: boolean;
};

function NewsCardInner({ item, lead = false }: NewsCardProps) {
  const { t } = useI18n();
  const { stock } = disclosureStockLabel(item);
  const trend = disclosureTrend(item.sentiment);
  const title = item.title ?? t("news.untitled");
  const preview = item.summary?.split("\n").filter(Boolean)[0] ?? "";
  const cover = getCoverImageUrl(item);

  return (
    <ProtectedContent className="h-full" blockContextMenu={false}>
      <Link
        href={`/disclosure/${item.id}`}
        prefetch
        className="block h-full"
        onClick={(e) => e.stopPropagation()}
      >
        <Card className={`news-card-frame h-full cursor-pointer gap-0 p-0${lead ? " news-card-frame--lead" : ""}`}>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="pointer-events-none h-36 w-full object-cover" />
          ) : null}
          <div className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="secondary" className="font-mono">
                {stock}
              </Badge>
              {trend === "up" ? (
                <TrendingUp className="h-4 w-4 shrink-0 text-green-500" aria-label={t("news.trendUp")} />
              ) : trend === "down" ? (
                <TrendingDown className="h-4 w-4 shrink-0 text-red-500" aria-label={t("news.trendDown")} />
              ) : null}
            </div>
            <h3 className="mb-2 font-medium leading-snug text-foreground">{title}</h3>
            {preview ? (
              <p className="mb-2 line-clamp-2 text-sm text-muted-foreground">{preview}</p>
            ) : null}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" aria-hidden />
              <LocalizedDate iso={item.created_at} />
            </div>
          </div>
        </Card>
      </Link>
    </ProtectedContent>
  );
}

function sameCard(a: NewsCardProps, b: NewsCardProps) {
  return (
    a.item.id === b.item.id &&
    a.item.title === b.item.title &&
    a.item.summary === b.item.summary &&
    a.item.created_at === b.item.created_at &&
    a.item.sentiment === b.item.sentiment &&
    a.lead === b.lead
  );
}

export const NewsCard = memo(NewsCardInner, sameCard);
