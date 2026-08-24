"use client";

import { useI18n } from "@/components/i18n/I18nProvider";

export function SearchPageHeader({ q, total }: { q: string; total: number }) {
  const { t } = useI18n();
  if (!q) {
    return <h1 className="text-xl font-semibold text-foreground">{t("search.title")}</h1>;
  }
  return (
    <h1 className="text-xl font-semibold text-foreground">
      {t("search.resultsFor", { q })}
      <span className="ml-2 text-base font-normal text-muted-foreground">
        {t("search.total", { total })}
      </span>
    </h1>
  );
}
