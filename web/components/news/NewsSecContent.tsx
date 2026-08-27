"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n/I18nProvider";
import { WireNewsCard } from "@/components/news/WireNewsCard";
import { useTickerQuotes } from "@/hooks/use-ticker-quotes";
import type { WireNewsRow } from "@/lib/gnw/types";
import { WIRE_NEWS_MAX_PAGES } from "@/lib/gnw/query";
import { uniqueWireNewsTickers, wireNewsTicker } from "@/lib/quotes/format";
import type { TickerQuoteMap } from "@/lib/quotes/types";

export function NewsSecContent({
  items,
  page,
  totalPages,
  quotes: initialQuotes,
}: {
  items: WireNewsRow[];
  page: number;
  totalPages: number;
  quotes?: TickerQuoteMap;
}) {
  const { t } = useI18n();
  const pages = Math.min(WIRE_NEWS_MAX_PAGES, Math.max(1, totalPages));
  const quotes = useTickerQuotes(uniqueWireNewsTickers(items), {
    initial: initialQuotes,
    pollMs: 15_000,
  });

  return (
    <main className="space-y-6">
      <header>
        <p className="text-sm font-medium text-muted-foreground">{t("newsSec.kicker")}</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">{t("newsSec.title")}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("newsSec.lead")}
        </p>
      </header>

      {items.length === 0 ? (
        <Card className="border-border">
          <CardContent>
            <h2 className="text-base font-semibold text-foreground">{t("newsSec.emptyTitle")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("newsSec.emptyBody")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((item) => (
              <WireNewsCard
                key={item.id}
                item={item}
                quote={quotes[wireNewsTicker(item)]}
              />
            ))}
          </div>
          <nav
            aria-label={t("newsSec.pages")}
            className="flex flex-wrap items-center justify-center gap-2 pt-2"
          >
            {Array.from({ length: WIRE_NEWS_MAX_PAGES }, (_, i) => i + 1).map((n) => {
              const available = n <= pages;
              if (!available) {
                return (
                  <Button key={n} type="button" size="sm" variant="outline" disabled>
                    {n}
                  </Button>
                );
              }
              return (
                <Button key={n} type="button" size="sm" variant={n === page ? "default" : "outline"} asChild>
                  <Link href={n === 1 ? "/news-sec" : `/news-sec?page=${n}`} prefetch>
                    {n}
                  </Link>
                </Button>
              );
            })}
          </nav>
        </>
      )}
    </main>
  );
}
