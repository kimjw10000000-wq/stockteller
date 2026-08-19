import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME_EN, SITE_NAME_KO } from "@/lib/site";
import { DATA_COPYRIGHT_NOTICE, DISCLAIMER_INVEST } from "@/lib/legal";

const LINKS = [
  { href: "/terms", label: "이용약관" },
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/disclaimer", label: "투자 유의사항" },
  { href: "/about", label: "사이트 소개" },
  { href: "/contact", label: "문의" },
] as const;

export function SiteFooter() {
  const year = 2026;

  return (
    <footer className="border-t border-white/10 bg-[#030213] text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold tracking-tight">
            {SITE_NAME_KO}
            <span className="ml-2 text-sm font-normal text-white/50">{SITE_NAME_EN}</span>
          </p>
          <p className="text-sm text-white/55">© {year} {SITE_NAME_KO}. All rights reserved.</p>
        </div>

        <nav aria-label="약관 및 안내" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-white/70 underline-offset-4 transition-colors hover:text-white hover:underline"
            >
              {item.label}
            </Link>
          ))}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-white/70 underline-offset-4 transition-colors hover:text-white hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
        </nav>

        <div className="space-y-3 border-t border-white/10 pt-6 text-sm leading-relaxed text-white/55">
          <p>{DATA_COPYRIGHT_NOTICE}</p>
          <p>{DISCLAIMER_INVEST}</p>
        </div>
      </div>
    </footer>
  );
}
