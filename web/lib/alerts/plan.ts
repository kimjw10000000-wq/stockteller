export const FREE_ALERT_SLOT_LIMIT = 1;
export const ALERT_SLOT_COUNT = 4;

export const UPGRADE_ALERT_MESSAGE =
  "최대 4개 이상의 종목을 동시 감시하려면 Pro 플랜으로 업그레이드하세요";

export type BillingPlan = "free" | "pro";

export function isProPlan(plan: string | null | undefined): boolean {
  return plan === "pro";
}

export function parseBillingPlan(plan: string | null | undefined): BillingPlan {
  return isProPlan(plan) ? "pro" : "free";
}
