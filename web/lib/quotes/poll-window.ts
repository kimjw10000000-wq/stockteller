import { EASTERN_TIME_ZONE, getZonedParts } from "@/lib/alerts/eastern-premarket";

/** US weekday extended hours: 04:00–20:00 ET (premarket through after-hours). */
export function isUsQuoteRushWindow(now = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    weekday: "short",
  }).format(now);
  if (weekday === "Sat" || weekday === "Sun") return false;

  const p = getZonedParts(now, EASTERN_TIME_ZONE);
  const minutes = p.hour * 60 + p.minute;
  return minutes >= 4 * 60 && minutes < 20 * 60;
}

export function etDayKey(now = new Date()): string {
  const p = getZonedParts(now, EASTERN_TIME_ZONE);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function tossQuotePollIntervalMs(now = new Date()): number {
  const fast = Math.max(1_000, Number(process.env.TOSS_QUOTE_RUSH_MS || 1_000) || 1_000);
  const slow = Math.max(fast, Number(process.env.TOSS_QUOTE_IDLE_MS || 5_000) || 5_000);
  return isUsQuoteRushWindow(now) ? fast : slow;
}
