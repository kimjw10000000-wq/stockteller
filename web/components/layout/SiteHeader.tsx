"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { HeaderAuth } from "@/components/auth/HeaderAuth";
import { SiteGnb } from "@/components/layout/SiteGnb";
import { Input } from "@/components/ui/input";
import { SITE_NAME_KO } from "@/lib/site";

export function SiteHeader() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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
      if (!q) {
        router.push("/search");
        return;
      }
      router.push(`/search?q=${encodeURIComponent(q)}`);
    },
    [query, router]
  );

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/feed" className="flex shrink-0 items-center gap-2">
            <TrendingUp className="h-7 w-7 text-green-500 sm:h-8 sm:w-8" aria-hidden />
            <span className="text-lg font-semibold text-foreground sm:text-xl">
              {SITE_NAME_KO}
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
              placeholder="티커 · 종목명 · 종목코드"
              className="border-border pl-10"
              aria-label="티커·종목명·종목코드 검색"
              enterKeyHint="search"
            />
          </form>

          <HeaderAuth />
        </div>
      </div>

      <div className="border-t border-border">
        <SiteGnb />
      </div>
    </header>
  );
}
