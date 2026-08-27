import { EASTERN_TIME_ZONE, getZonedParts } from "@/lib/alerts/eastern-premarket";

/** US Eastern weekday premarket: 04:00–09:30 ET (news-heavy). */
export function isEasternPremarketPollWindow(now = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    weekday: "short",
  }).format(now);
  if (weekday === "Sat" || weekday === "Sun") return false;

  const p = getZonedParts(now, EASTERN_TIME_ZONE);
  const minutes = p.hour * 60 + p.minute;
  return minutes >= 4 * 60 && minutes < 9 * 60 + 30;
}

export function gnwPollIntervalMs(now = new Date()): number {
  const fast = Math.max(5_000, Number(process.env.CRAWL_GNW_PREMARKET_MS || 15_000) || 15_000);
  const slow = Math.max(fast, Number(process.env.CRAWL_GNW_IDLE_MS || 60_000) || 60_000);
  return isEasternPremarketPollWindow(now) ? fast : slow;
}
