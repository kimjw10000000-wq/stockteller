"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n/I18nProvider";
import { visiblePageItems } from "@/lib/gnw/nav";

export function WireNewsPager({
  page,
  totalPages,
  hrefForPage,
}: {
  page: number;
  totalPages: number;
  hrefForPage: (n: number) => string;
}) {
  const { t } = useI18n();
  const last = Math.max(1, totalPages);
  if (last <= 1) return null;

  const items = visiblePageItems(page, last);

  return (
    <nav aria-label={t("newsSec.pages")} className="flex flex-wrap items-center justify-center gap-2 pt-2">
      {page > 1 ? (
        <Button type="button" size="sm" variant="outline" asChild>
          <Link href={hrefForPage(page - 1)} prefetch>
            {t("newsSec.prevPage")}
          </Link>
        </Button>
      ) : (
        <Button type="button" size="sm" variant="outline" disabled>
          {t("newsSec.prevPage")}
        </Button>
      )}
      {items.map((item, i) =>
        item === "ellipsis" ? (
          <span key={`e-${i}`} className="px-1 text-sm text-muted-foreground" aria-hidden>
            …
          </span>
        ) : (
          <Button
            key={item}
            type="button"
            size="sm"
            variant={item === page ? "default" : "outline"}
            asChild
          >
            <Link href={hrefForPage(item)} prefetch>
              {item}
            </Link>
          </Button>
        )
      )}
      {page < last ? (
        <Button type="button" size="sm" variant="outline" asChild>
          <Link href={hrefForPage(page + 1)} prefetch>
            {t("newsSec.nextPage")}
          </Link>
        </Button>
      ) : (
        <Button type="button" size="sm" variant="outline" disabled>
          {t("newsSec.nextPage")}
        </Button>
      )}
    </nav>
  );
}
