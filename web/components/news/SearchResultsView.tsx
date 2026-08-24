"use client";

import { FileSearch, SearchX } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { NewsCard } from "@/components/news/NewsCard";
import type { DisclosureWithStock } from "@/lib/types";

type SearchResultsViewProps = {
  q: string;
  items: DisclosureWithStock[];
  total: number;
};

export function SearchResultsView({ q, items, total }: SearchResultsViewProps) {
  const { t } = useI18n();

  if (!q) {
    return (
      <div
        className="flex flex-col items-center rounded-xl border border-border bg-card px-6 py-16 text-center"
        role="status"
      >
        <FileSearch className="mb-4 h-12 w-12 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-foreground">{t("search.promptTitle")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("search.promptHint")}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className="flex flex-col items-center rounded-xl border border-border bg-card px-6 py-16 text-center"
        role="status"
      >
        <SearchX className="mb-4 h-12 w-12 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-foreground">{t("search.emptyTitle", { q })}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("search.emptyHint")}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2" role="list">
      {items.map((item) => (
        <div key={item.id} role="listitem">
          <NewsCard item={item} />
        </div>
      ))}
      {total >= 200 ? (
        <p className="col-span-full mt-2 text-center text-xs text-muted-foreground">
          {t("search.capped")}
        </p>
      ) : null}
    </div>
  );
}
