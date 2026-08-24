"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/I18nProvider";

export function PricingContent() {
  const { t } = useI18n();
  return (
    <main className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="text-sm font-medium text-muted-foreground">{t("pricing.kicker")}</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">{t("pricing.title")}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("pricing.lead")}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">{t("pricing.freeName")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("pricing.freeTag")}</p>
          <ul className="mt-4 space-y-2 text-sm text-foreground">
            <li>{t("pricing.freeSlot")}</li>
            <li>{t("pricing.freeWindow")}</li>
          </ul>
        </section>
        <section className="rounded-xl border-2 border-sky-500 bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-sky-700">
            {t("pricing.recommended")}
          </p>
          <h2 className="mt-1 text-lg font-semibold">{t("pricing.proName")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("pricing.proTag")}</p>
          <ul className="mt-4 space-y-2 text-sm text-foreground">
            <li>{t("pricing.proSlot")}</li>
            <li>{t("pricing.proUnlimited")}</li>
          </ul>
          <p className="mt-6 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            {t("pricing.pending")}
          </p>
        </section>
      </div>

      <p className="text-sm text-muted-foreground">
        <Link href="/watchman" prefetch className="font-medium text-foreground underline-offset-4 hover:underline">
          {t("pricing.back")}
        </Link>
      </p>
    </main>
  );
}
