import { canSendFreeAlertThisWindow } from "./eastern-premarket";
import type { AlertStatus } from "./types";

export const ALERT_STATUS_LABEL: Record<AlertStatus, string> = {
  watching: "감시 중",
  inactive: "비활성화",
  sent_today: "오늘 알림 발송 완료",
};

export function getAlertStatus(options: {
  enabled: boolean;
  ticker: string | null | undefined;
  isPro: boolean;
  lastTriggeredAt: Date | string | null | undefined;
  now?: Date;
}): AlertStatus {
  const ticker = options.ticker?.trim() ?? "";
  if (!options.enabled || !ticker) return "inactive";
  if (
    !options.isPro &&
    !canSendFreeAlertThisWindow(options.lastTriggeredAt, options.now ?? new Date())
  ) {
    return "sent_today";
  }
  return "watching";
}
