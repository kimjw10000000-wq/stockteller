import type { DisclosureWithStock } from "@/lib/types";

export type SignalStatus = "positive" | "neutral" | "caution" | "danger";

export const SIGNAL_STATUSES: SignalStatus[] = ["positive", "neutral", "caution", "danger"];

export const SIGNAL_LABELS: Record<SignalStatus, string> = {
  positive: "🟢 순항 중",
  neutral: "⚪ 관망",
  caution: "🟡 전방에 암초 감지",
  danger: "🚨 난파선 위기",
};

export const SIGNAL_SHORT_LABELS: Record<SignalStatus, string> = {
  positive: "순항 중",
  neutral: "관망",
  caution: "암초 감지",
  danger: "난파선 위기",
};

export const SIGNAL_DESCRIPTIONS: Record<SignalStatus, string> = {
  positive:
    "강력한 호재 공시가 확인되어, 상승 에너지를 얻고 돛을 올린 상태입니다.",
  neutral: "특이사항 없는 평온한 상태입니다. 흐름을 관망하며 다음 시그널을 대기하세요.",
  caution:
    "주가가 이미 많이 올랐거나 리스크 요인이 앞에 포착되어 신중한 주의가 필요한 상태입니다.",
  danger:
    "치명적인 악재를 정면으로 들이받아 침몰 위험이 매우 높은 위험천만한 상태입니다.",
};

/** 가로 반원 4구역 바늘 CSS 회전각 (0°=위, -90°=왼쪽 끝, +90°=오른쪽 끝) */
export const SIGNAL_NEEDLE_ROTATE: Record<SignalStatus, number> = {
  positive: -90,
  neutral: -30,
  caution: 30,
  danger: 90,
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
