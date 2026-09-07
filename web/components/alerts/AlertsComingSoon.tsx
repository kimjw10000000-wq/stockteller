"use client";

import Image from "next/image";
import { useI18n } from "@/components/i18n/I18nProvider";

/** 본문 py-8만 상쇄해 GNB(헤더) 바로 아래부터 채운다. fixed가 아니라 페이지와 같이 스크롤된다. */
export function AlertsComingSoon() {
  const { t } = useI18n();

  return (
    <figure className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 -mt-8 -mb-8 h-[calc(100dvh-8rem)] min-h-[28rem] overflow-hidden">
      <Image
        src="/alerts-coming-soon.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />
      <figcaption className="pointer-events-none absolute left-[3.2%] top-[3.8%] z-10 max-w-[36%] text-black">
        <p className="text-[clamp(1.1rem,2.4vw,1.75rem)] font-semibold leading-tight">{t("alerts.comingSoon")}</p>
        <p className="mt-2 text-[clamp(0.8rem,1.55vw,1.1rem)] leading-snug">{t("alerts.comingSoonBody")}</p>
      </figcaption>
    </figure>
  );
}
