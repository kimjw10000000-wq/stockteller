import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { SITE_NAME_EN, SITE_NAME_KO } from "@/lib/site";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2 font-semibold text-slate-900">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#3182f6] text-white shadow-sm shadow-blue-500/20">
            <TrendingUp className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block text-base sm:text-lg">{SITE_NAME_KO}</span>
            <span className="block text-[10px] font-normal uppercase tracking-wide text-slate-400 sm:text-xs">
              {SITE_NAME_EN}
            </span>
          </span>
        </Link>
        <nav className="flex shrink-0 items-center gap-3 text-sm" aria-label="주 메뉴">
          <Link href="/volatile" className="text-slate-600 hover:text-[#3182f6]">
            급등 감시
          </Link>
          <Link
            href="/feed"
            className="font-medium text-[#3182f6] hover:text-[#1b64da]"
          >
            뉴스
          </Link>
          <span className="hidden text-slate-300 sm:inline" aria-hidden>
            |
          </span>
          <span className="hidden text-slate-500 sm:inline">SEC · 나스닥</span>
        </nav>
      </div>
    </header>
  );
}
