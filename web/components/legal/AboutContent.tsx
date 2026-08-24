"use client";

import { LegalArticle } from "@/components/legal/LegalArticle";
import { useI18n } from "@/components/i18n/I18nProvider";
import { CONTACT_EMAIL } from "@/lib/site";

export function AboutContent() {
  const { t } = useI18n();
  const name = t("brand.name");
  const nameEn = t("brand.nameEn");
  return (
    <LegalArticle title={t("about.title", { name })} updated="2026-08-18">
      <p>{t("about.p1", { name, nameEn })}</p>
      <h2>{t("about.tools")}</h2>
      <ul>
        <li>{t("about.toolAlerts")}</li>
        <li>{t("about.toolArticles")}</li>
        <li>{t("about.toolNewsSec")}</li>
        <li>{t("about.toolIndicators")}</li>
        <li>{t("about.toolHalts")}</li>
        <li>{t("about.toolSimilar")}</li>
      </ul>
      <h2>{t("about.ops")}</h2>
      <p>
        {t("about.p2", { email: CONTACT_EMAIL }).split(CONTACT_EMAIL).map((part, i, arr) =>
          i < arr.length - 1 ? (
            <span key={i}>
              {part}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </span>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </p>
    </LegalArticle>
  );
}
