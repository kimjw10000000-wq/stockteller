"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/I18nProvider";

export function NewsSecContent() {
  const { t } = useI18n();
  return (
    <main className="space-y-6">
      <header>
        <p className="text-sm font-medium text-muted-foreground">{t("newsSec.kicker")}</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">{t("newsSec.title")}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("newsSec.lead")}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border">
          <CardContent>
            <h2 className="text-base font-semibold text-foreground">Newsfilter</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("newsSec.newsfilterBody")}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent>
            <h2 className="text-base font-semibold text-foreground">SEC EDGAR</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("newsSec.edgarBody")}</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
