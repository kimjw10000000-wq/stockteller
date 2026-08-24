"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { HeaderAuth } from "@/components/auth/HeaderAuth";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/components/i18n/I18nProvider";
import { SiteGnb } from "@/components/layout/SiteGnb";
import { Input } from "@/components/ui/input";

export function SiteHeader() {
  const router = useRouter();
  const { t } = useI18n();
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
    <header className="relative z-30 border-b border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/feed" prefetch className="flex shrink-0 items-center gap-2">
            <TrendingUp className="h-7 w-7 text-green-500 sm:h-8 sm:w-8" aria-hidden />
            <span className="text-lg font-semibold text-foreground sm:text-xl">
              {t("brand.name")}
            </span>
          </Link>

          <form onSubmit={onSearch} className="relative min-w-0 flex-1 max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("header.searchPlaceholder")}
              className="border-border pl-10"
              aria-label={t("header.searchAria")}
              enterKeyHint="search"
            />
          </form>

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
