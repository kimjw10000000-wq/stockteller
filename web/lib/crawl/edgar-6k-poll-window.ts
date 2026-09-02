import { isUsQuoteRushWindow } from "@/lib/quotes/poll-window";

/** US weekday premarket–after hours: 04:00–20:00 ET. Else overnight/weekend ("데이"). */
export function edgar6kPollIntervalMs(now = new Date()): number {
  const fast = Math.max(200, Number(process.env.CRAWL_6K_RUSH_MS || 200) || 200);
  const slow = Math.max(fast, Number(process.env.CRAWL_6K_IDLE_MS || 600_000) || 600_000);
  return isUsQuoteRushWindow(now) ? fast : slow;
}
