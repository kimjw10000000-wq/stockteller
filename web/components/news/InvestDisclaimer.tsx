import { DISCLAIMER_BODY, DISCLAIMER_TITLE } from "@/lib/legal";

export function InvestDisclaimer() {
  return (
    <aside
      className="mt-8 rounded-lg border border-border/80 bg-muted/30 px-4 py-4 sm:px-5"
      aria-labelledby="invest-disclaimer-heading"
    >
      <h2
        id="invest-disclaimer-heading"
        className="text-sm font-medium text-muted-foreground"
      >
        {DISCLAIMER_TITLE}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground/90">{DISCLAIMER_BODY}</p>
    </aside>
  );
}
