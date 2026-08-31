import type { Locale } from "./config";

/**
 * Seoul wall-clock, assembled from parts so Node ICU and Chromium agree.
 * `ko-KR` `.format()` uses "PM" on the server and "오후" in the browser.
 */
export function formatSeoulDateTime(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const map: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }

  const year = map.year ?? "0000";
  const month = (map.month ?? "01").padStart(2, "0");
  const day = (map.day ?? "01").padStart(2, "0");
  let hour = Number(map.hour ?? "0");
  if (hour === 24) hour = 0;
  const minute = (map.minute ?? "00").padStart(2, "0");
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const hh = String(hour12).padStart(2, "0");

  if (locale === "ko") {
    const period = hour < 12 ? "오전" : "오후";
    return `${year}. ${month}. ${day}. ${period} ${hh}:${minute}`;
  }

  const period = hour < 12 ? "AM" : "PM";
  return `${month}/${day}/${year}, ${hh}:${minute} ${period}`;
}
