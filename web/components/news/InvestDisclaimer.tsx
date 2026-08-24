"use client";

import { useI18n } from "@/components/i18n/I18nProvider";

export function InvestDisclaimer() {
  const { t } = useI18n();
  return (
    <aside
      className="mt-8 rounded-lg border border-border/80 bg-muted/30 px-4 py-4 sm:px-5"
      aria-labelledby="invest-disclaimer-heading"
    >
      <h2
        id="invest-disclaimer-heading"
        className="text-sm font-medium text-muted-foreground"
      >
        {t("news.disclaimerTitle")}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground/90">
        {t("news.disclaimerBody")}
      </p>
    </aside>
  );
}
