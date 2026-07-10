import type { DisclosureWithStock } from "@/lib/types";

export type SignalStatus = "positive" | "caution" | "danger";

export const SIGNAL_STATUSES: SignalStatus[] = ["positive", "caution", "danger"];

export const SIGNAL_LABELS: Record<SignalStatus, string> = {
  positive: "긍정 시그널",
  caution: "주의 시그널",
  danger: "위험 시그널",
};

export const SIGNAL_SHORT_LABELS: Record<SignalStatus, string> = {
  positive: "긍정",
  caution: "주의",
  danger: "위험",
};

/** SVG 바늘 각도 (0°=오른쪽, 반시계, 상단 반원 게이지) */
export const SIGNAL_NEEDLE_DEG: Record<SignalStatus, number> = {
  positive: 225,
  caution: 270,
  danger: 315,
};

export const DEFAULT_SIGNAL_STATUS: SignalStatus = "positive";

export function isSignalStatus(value: unknown): value is SignalStatus {
  return typeof value === "string" && SIGNAL_STATUSES.includes(value as SignalStatus);
}

export function parseSignalStatus(value: unknown): SignalStatus {
  return isSignalStatus(value) ? value : DEFAULT_SIGNAL_STATUS;
}

export function resolveDisclosureSignalStatus(item: {
  signal_status?: string | null;
  gemini_metadata?: Record<string, unknown> | null;
}): SignalStatus {
  if (isSignalStatus(item.signal_status)) return item.signal_status;
  return parseSignalStatus(item.gemini_metadata?.signal_status);
}

export function signalStatusFromForm(value: FormDataEntryValue | null): SignalStatus {
  return parseSignalStatus(String(value ?? ""));
}

export function disclosureWithResolvedSignal(item: DisclosureWithStock): DisclosureWithStock {
  return { ...item, signal_status: resolveDisclosureSignalStatus(item) };
}
