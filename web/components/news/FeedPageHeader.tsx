"use client";

import { Suspense } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { NewsSortBar } from "@/components/news/NewsSortBar";

type FeedPageHeaderProps = {
  q: string;
};

export function FeedPageHeader({ q }: FeedPageHeaderProps) {
  const { t } = useI18n();
  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-foreground">{t("feed.title")}</h1>
        <Suspense fallback={<div className="h-8 w-48 animate-pulse rounded-md bg-muted" />}>
          <NewsSortBar />
        </Suspense>
      </div>
      {q ? (
        <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground">
          {t("feed.searchChip")} <span className="font-semibold">「{q}」</span>
          <span className="ml-2 text-muted-foreground">{t("feed.searchHint")}</span>
        </p>
      ) : null}
    </>
  );
}
