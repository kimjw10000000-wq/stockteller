export const FREE_ALERT_SLOT_LIMIT = 1;

export type BillingPlan = "free" | "pro";

export function isProPlan(plan: string | null | undefined): boolean {
  return plan === "pro";
}

export function parseBillingPlan(plan: string | null | undefined): BillingPlan {
  return isProPlan(plan) ? "pro" : "free";
}
