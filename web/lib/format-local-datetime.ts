/**
 * Format an ISO UTC timestamp in the viewer's local timezone:
 * `YYYY년 MM월 DD일 HH:mm (KST)`
 */
export function formatLocalDateTimeKo(isoUtc: string | null | undefined): string | null {
  if (!isoUtc?.trim()) return null;
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return null;

  const map: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).formatToParts(d)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }

  const y = map.year ?? "0000";
  const mo = (map.month ?? "01").padStart(2, "0");
  const day = (map.day ?? "01").padStart(2, "0");
  const hh = (map.hour === "24" ? "00" : map.hour ?? "00").padStart(2, "0");
  const mm = (map.minute ?? "00").padStart(2, "0");

  const tzId = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let tz = (map.timeZoneName ?? "").replace(/^GMT/, "UTC").trim() || "Local";
  if (tzId === "Asia/Seoul") tz = "KST";
  else if (tzId === "Asia/Tokyo") tz = "JST";

  return `${y}년 ${mo}월 ${day}일 ${hh}:${mm} (${tz})`;
}
