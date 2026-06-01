"use client";

import Link from "next/link";
import { Clock, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { DisclosureWithStock } from "@/lib/types";
import { disclosureStockLabel, disclosureTrend } from "@/lib/news-display";
import { formatNewsDate } from "@/lib/news-sort";

type NewsCardProps = {
  item: DisclosureWithStock;
};

export function NewsCard({ item }: NewsCardProps) {
  const { stock } = disclosureStockLabel(item);
  const trend = disclosureTrend(item.sentiment);
  const title = item.title ?? "제목 없음";
  const preview = item.summary?.split("\n").filter(Boolean)[0] ?? "";

  return (
    <Link href={`/disclosure/${item.id}`} className="block h-full">
      <Card className="h-full cursor-pointer gap-0 p-4 transition-all hover:border-primary/50 hover:shadow-md">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="secondary" className="font-mono">
                {stock}
              </Badge>
              {trend === "up" ? (
                <TrendingUp className="h-4 w-4 shrink-0 text-green-500" aria-label="상승" />
              ) : trend === "down" ? (
                <TrendingDown className="h-4 w-4 shrink-0 text-red-500" aria-label="하락" />
              ) : null}
            </div>
            <h3 className="mb-2 font-medium leading-snug text-foreground">{title}</h3>
            {preview ? (
              <p className="mb-2 line-clamp-2 text-sm text-muted-foreground">{preview}</p>
            ) : null}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" aria-hidden />
              <span>{formatNewsDate(item.created_at)}</span>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
