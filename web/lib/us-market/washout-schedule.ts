import { isTossConfigured } from "@/lib/toss/client";
import { fetchTossMarketCalendar } from "@/lib/toss/stocks";
import { isNyseFullCloseDate } from "./nyse-holidays";
import { isUsWeekday, sessionAtInstant, usEtYmd } from "./us-session";

export type WashoutSkipReason = "weekend_or_closed" | "holiday" | "ok";

/**
 * 설거지 라이브 캡처: 미국 프리·본장·애프터.
 * 주말·NYSE 전일 휴장은 건너뛴다.
 */
export async function washoutCaptureSkipReason(now = new Date()): Promise<WashoutSkipReason> {
  if (!isUsWeekday(now)) return "weekend_or_closed";
  const session = sessionAtInstant(now);
  if (session == null) return "weekend_or_closed";
  const ymd = usEtYmd(now);
  if (isNyseFullCloseDate(ymd)) return "holiday";
  if (isTossConfigured()) {
    try {
      const cal = await fetchTossMarketCalendar("US", ymd);
      if (cal.country !== "US") return "ok";
      const day = cal.today;
      if (!day.afterMarket && !day.regularMarket && !day.preMarket) return "holiday";
    } catch {
      /* Toss 달력이 없어도 NYSE 휴장표로 막는다 */
    }
  }
  return "ok";
}

export async function shouldCaptureWashoutLive(now = new Date()): Promise<boolean> {
  return (await washoutCaptureSkipReason(now)) === "ok";
}
