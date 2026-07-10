"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, TrendingUp } from "lucide-react";
import { useCallback, useState } from "react";
import { Input } from "@/components/ui/input";
import { SITE_NAME_KO } from "@/lib/site";

export function SiteHeader() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const onSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = query.trim();
      const params = new URLSearchParams(window.location.search);
      if (q) params.set("q", q);
      else params.delete("q");
      router.push(`/feed?${params.toString()}`);
    },
    [query, router]
  );

  return (
    <header className="border-b border-border bg-card px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4">
        <Link href="/feed" className="flex shrink-0 items-center gap-2">
          <TrendingUp className="h-8 w-8 text-green-500" aria-hidden />
          <span className="text-xl font-semibold text-foreground">{SITE_NAME_KO}</span>
        </Link>

        <form onSubmit={onSearch} className="relative min-w-[200px] flex-1 max-w-md sm:ml-auto">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="티커 · 종목명 · 종목코드"
            className="border-border pl-10"
            aria-label="티커·종목명·종목코드 검색"
          />
        </form>
      </div>
    </header>
  );
}
