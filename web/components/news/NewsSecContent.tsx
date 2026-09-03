"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n/I18nProvider";
import { WireNewsCard } from "@/components/news/WireNewsCard";
import { WireNewsPager } from "@/components/news/WireNewsPager";
import { useTickerQuotes } from "@/hooks/use-ticker-quotes";
import type { WireNewsRow } from "@/lib/gnw/types";
import { newsSecHref, type WireNewsFilter } from "@/lib/gnw/nav";
import { uniqueWireNewsTickers, wireNewsTicker } from "@/lib/quotes/format";
import type { TickerQuoteMap } from "@/lib/quotes/types";

export function NewsSecContent({
  items,
  page,
  totalPages,
  quotes: initialQuotes,
  filter = "latest",
}: {
  items: WireNewsRow[];
  page: number;
  totalPages: number;
  quotes?: TickerQuoteMap;
  filter?: WireNewsFilter;
}) {
  const { t } = useI18n();
  const quotes = useTickerQuotes(uniqueWireNewsTickers(items), {
    initial: initialQuotes,
    pollMs: 1_000,
  });
  const filters: WireNewsFilter[] = ["latest", "gainers", "losers"];

  return (
    <main className="space-y-6">
      <header>
        <p className="text-sm font-medium text-muted-foreground">{t("newsSec.kicker")}</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">{t("newsSec.title")}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("newsSec.lead")}
        </p>
        <nav aria-label={t("newsSec.filters")} className="mt-4 flex flex-wrap gap-2">
          {filters.map((id) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={filter === id ? "default" : "outline"}
              asChild
            >
              <Link href={newsSecHref(id)} prefetch>
                {t(`newsSec.filter.${id}`)}
              </Link>
            </Button>
          ))}
        </nav>
      </header>

      {items.length === 0 ? (
        <Card className="border-border">
          <CardContent>
            <h2 className="text-base font-semibold text-foreground">{t("newsSec.emptyTitle")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {filter === "latest" ? t("newsSec.emptyBody") : t("newsSec.emptyMovers")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-y-4 gap-x-12 md:grid-cols-2">
            {items.map((item, index) => (
              <WireNewsCard
                key={item.id}
                item={item}
                quote={quotes[wireNewsTicker(item)]}
                lead={index < 2}
              />
            ))}
          </div>
          <WireNewsPager
            page={page}
            totalPages={totalPages}
            hrefForPage={(n) => newsSecHref(filter, n)}
          />
        </>
      )}
    </main>
  );
}
