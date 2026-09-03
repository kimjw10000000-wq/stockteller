"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/I18nProvider";
import { CONTACT_EMAIL } from "@/lib/site";

const LINKS = [
  { href: "/terms", labelKey: "footer.terms" },
  { href: "/privacy", labelKey: "footer.privacy" },
  { href: "/disclaimer", labelKey: "footer.disclaimer" },
  { href: "/about", labelKey: "footer.about" },
  { href: "/contact", labelKey: "footer.contact" },
] as const;

export function SiteFooter() {
  const { t } = useI18n();
  const year = 2026;

  return (
    <footer className="border-t border-white/10 bg-[#030213] text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-10 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold tracking-tight">
            {t("brand.name")}
            {t("brand.nameEn") !== t("brand.name") ? (
              <span className="ml-2 text-sm font-normal text-white/50">{t("brand.nameEn")}</span>
            ) : null}
          </p>
          <p className="text-sm text-white/55">
            © {year} {t("brand.name")}. {t("footer.copyright")}
          </p>
        </div>

        <nav aria-label={t("footer.legalNav")} className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className="text-white/70 underline-offset-4 transition-colors hover:text-white hover:underline"
            >
              {t(item.labelKey)}
            </Link>
          ))}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-white/70 underline-offset-4 transition-colors hover:text-white hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
        </nav>

        <div className="space-y-3 border-t border-white/10 pt-6 text-sm leading-relaxed text-white/55">
          <p>{t("footer.dataNotice")}</p>
          <p>{t("footer.investNotice")}</p>
        </div>
      </div>
    </footer>
  );
}
