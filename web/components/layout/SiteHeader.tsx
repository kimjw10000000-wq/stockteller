"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, Search, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SiteNavDrawer } from "@/components/layout/SiteNavDrawer";
import { Input } from "@/components/ui/input";
import { SITE_NAME_KO } from "@/lib/site";

export function SiteHeader() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
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

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <>
      <header className="border-b border-border bg-card px-4 py-3 sm:px-6 sm:py-4">
        <div className="mx-auto flex max-w-7xl items-center gap-2 sm:gap-3">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <TrendingUp className="h-7 w-7 text-green-500 sm:h-8 sm:w-8" aria-hidden />
            <span className="text-lg font-semibold text-foreground sm:text-xl">
              {SITE_NAME_KO}
            </span>
          </Link>

          <form
            onSubmit={onSearch}
            className="relative min-w-0 flex-1 max-w-md"
          >
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

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent sm:px-3"
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            aria-controls="site-nav-drawer"
          >
            <Menu className="h-5 w-5" aria-hidden />
            <span>메뉴</span>
          </button>
        </div>
      </header>

      <div id="site-nav-drawer">
        <SiteNavDrawer open={menuOpen} onClose={closeMenu} />
      </div>
    </>
  );
}
