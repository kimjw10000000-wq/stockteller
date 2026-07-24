"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, FilePenLine, LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

const NAV = [
  {
    href: "/admin/dashboard",
    label: "뉴스 작성",
    description: "발행 · 수정",
    icon: FilePenLine,
    match: (path: string) => path.startsWith("/admin/dashboard"),
  },
  {
    href: "/admin/compliance",
    label: "상장유지 D-Day 관리",
    description: "스몰캡 유예 추적",
    icon: CalendarClock,
    match: (path: string) => path.startsWith("/admin/compliance"),
  },
] as const;

export function AdminNav() {
  const pathname = usePathname() || "";

  async function onLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/admin";
  }

  return (
    <header className="mb-8 border-b border-border pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Admin
          </p>
          <p className="text-lg font-semibold text-foreground">관리자 콘솔</p>
        </div>
        <button
          type="button"
          onClick={() => void onLogout()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          로그아웃
        </button>
      </div>

      <nav className="mt-4 flex flex-wrap gap-2" aria-label="관리자 메뉴">
        {NAV.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-w-[10rem] flex-1 items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors sm:flex-none",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-accent"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight">
                  {item.label}
                </span>
                <span
                  className={cn(
                    "block text-[11px] leading-tight",
                    active ? "text-primary-foreground/75" : "text-muted-foreground"
                  )}
                >
                  {item.description}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
