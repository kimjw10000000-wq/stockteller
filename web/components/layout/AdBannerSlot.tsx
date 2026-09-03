export function AdBannerSlot() {
  return (
    <section
      className="mx-auto flex max-w-7xl items-center justify-center border-b border-border bg-muted/40 px-4 py-10 sm:px-6"
      aria-label="광고 배너"
    >
      <div className="flex h-28 w-full max-w-4xl flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card text-center sm:h-32">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">광고 영역</p>
        <p className="mt-1 text-sm text-muted-foreground">배너 슬롯 · 추후 광고 코드 삽입</p>
      </div>
    </section>
  );
}
