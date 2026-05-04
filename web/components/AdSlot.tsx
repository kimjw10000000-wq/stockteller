type AdSlotPosition = "top" | "middle" | "bottom";

const labels: Record<AdSlotPosition, string> = {
  top: "광고 영역 (상단)",
  middle: "광고 영역 (중단)",
  bottom: "광고 영역 (하단)",
};

type AdSlotProps = {
  position: AdSlotPosition;
  className?: string;
};

/**
 * Placeholder for Google AdSense (or similar).
 * Replace the inner markup with your approved snippet when ready.
 */
export function AdSlot({ position, className }: AdSlotProps) {
  return (
    <aside
      className={[
        "my-8 flex min-h-[120px] w-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80 text-center text-sm text-slate-400",
        className ?? "",
      ].join(" ")}
      aria-label={`${labels[position]} — Google AdSense 슬롯`}
      data-ad-slot={position}
    >
      {/* After AdSense approval, mount your <ins class="adsbygoogle" ... /> here */}
      <div className="px-4 py-6">{labels[position]}</div>
    </aside>
  );
}
