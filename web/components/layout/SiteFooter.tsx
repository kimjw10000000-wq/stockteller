import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME_EN, SITE_NAME_KO } from "@/lib/site";
import { DISCLAIMER_FOOTER } from "@/lib/legal";

const LINKS = [
  { href: "/about", label: "사이트 소개" },
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/contact", label: "문의" },
  { href: "/disclaimer", label: "투자 유의사항" },
] as const;

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-8 sm:px-6">
        <nav aria-label="약관 및 안내" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <p className="text-sm leading-relaxed text-muted-foreground">{DISCLAIMER_FOOTER}</p>
        <p className="text-xs text-muted-foreground">
          © {year} {SITE_NAME_KO} ({SITE_NAME_EN}) ·{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
        </p>
      </div>
    </footer>
  );
}
