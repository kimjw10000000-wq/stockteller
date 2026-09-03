"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { HeaderAuth } from "@/components/auth/HeaderAuth";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/components/i18n/I18nProvider";
import { SiteGnb } from "@/components/layout/SiteGnb";

export function SiteHeader() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const logo =
    locale === "en"
      ? { src: "/logo-en.png", width: 217, height: 70 }
      : { src: "/logo-ko.png", width: 1024, height: 352 };
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const path = window.location.pathname;
    if (path !== "/search") return;
    const q = new URLSearchParams(window.location.search).get("q") ?? "";
    setQuery(q);
  }, []);

  const onSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      inputRef.current?.blur();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      const q = query.trim();
      startTransition(() => {
        if (!q) {
          router.push("/search");
          return;
        }
        router.push(`/search?q=${encodeURIComponent(q)}`);
      });
    },
    [query, router, startTransition]
  );

  return (
    <header className="relative z-30 border-b border-border bg-transparent">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-4">
        <div className="site-header-top flex items-center gap-2 sm:gap-3">
          <Link href="/feed" prefetch className="site-logo">
            <Image
              key={logo.src}
              src={logo.src}
              alt={t("brand.name")}
              width={logo.width}
              height={logo.height}
              priority
              className="site-logo__img"
            />
          </Link>

          <div className="site-search-wrap">
            <form onSubmit={onSearch} className="site-search" role="search">
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("header.searchPlaceholder")}
                className="site-search__field"
                aria-label={t("header.searchAria")}
                enterKeyHint="search"
              />
              <button type="submit" className="sr-only">
                {t("header.searchAria")}
              </button>
            </form>
          </div>

          <LanguageSwitcher />
          <HeaderAuth />
        </div>
      </div>

      <div className="border-t border-border">
        <SiteGnb />
      </div>
    </header>
  );
}
