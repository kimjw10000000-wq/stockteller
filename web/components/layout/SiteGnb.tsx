"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { SITE_GNB_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function SiteGnb() {
  const pathname = usePathname() || "/";
  const { t } = useI18n();

  return (
    <nav
      aria-label={t("nav.main")}
      className="w-full max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]"
    >
      <div className="mx-auto flex max-w-7xl min-w-0 flex-nowrap gap-0.5 px-4 sm:gap-1 sm:px-6">
        {SITE_GNB_ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              title={t(item.descKey)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 whitespace-nowrap border-b-2 px-2.5 py-2.5 text-sm transition-colors sm:px-3",
                active
                  ? "border-foreground font-semibold text-foreground"
                  : "border-transparent font-semibold text-foreground hover:text-foreground"
              )}
            >
              {t(item.labelKey)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
