import type { DisclosureWithStock } from "@/lib/types";

export type SignalStatus = "positive" | "neutral" | "caution" | "danger";

export const SIGNAL_STATUSES: SignalStatus[] = ["positive", "neutral", "caution", "danger"];

export const SIGNAL_LABELS: Record<SignalStatus, string> = {
  positive: "🟢 긍정",
  neutral: "⚪ 관망",
  caution: "🟡 주의",
  danger: "🚨 위험",
};

export const SIGNAL_SHORT_LABELS: Record<SignalStatus, string> = {
  positive: "긍정",
  neutral: "관망",
  caution: "주의",
  danger: "위험",
};

export const SIGNAL_DESCRIPTIONS: Record<SignalStatus, string> = {
  positive: "기업 가치에 이로운 호재성 내용이 확인된 상태입니다.",
  neutral: "특이사항이 없는 평온한 상태입니다. 흐름을 지켜보세요.",
  caution: "주가가 이미 많이 올랐거나 리스크 요인이 감지되어 유의가 필요합니다.",
  danger: "치명적인 악재 공시나 폭락 징후가 감지되어 위험도가 높은 상태입니다.",
};

/** 게이지 4구역 중심 극좌표(°): 0=오른쪽, 90=위, 180=왼쪽 */
export const SIGNAL_NEEDLE_POLAR_DEG: Record<SignalStatus, number> = {
  positive: 157.5,
  neutral: 112.5,
  caution: 67.5,
  danger: 22.5,
};

/** 바늘 기본 방향(위) → 구역 중심. CSS rotate = 90° − 극좌표 */
export const SIGNAL_NEEDLE_ROTATE: Record<SignalStatus, number> = {
  positive: 90 - SIGNAL_NEEDLE_POLAR_DEG.positive,
  neutral: 90 - SIGNAL_NEEDLE_POLAR_DEG.neutral,
  caution: 90 - SIGNAL_NEEDLE_POLAR_DEG.caution,
  danger: 90 - SIGNAL_NEEDLE_POLAR_DEG.danger,
};

export const DEFAULT_SIGNAL_STATUS: SignalStatus = "positive";

export function isSignalStatus(value: unknown): value is SignalStatus {
  return typeof value === "string" && SIGNAL_STATUSES.includes(value as SignalStatus);
}

export function parseSignalStatus(value: unknown): SignalStatus {
  return isSignalStatus(value) ? value : DEFAULT_SIGNAL_STATUS;
}

/** gemini_metadata.signal_status 단일 소스 (관리자 저장 경로) */
export function readSignalFromGeminiMetadata(
  meta: Record<string, unknown> | null | undefined
): SignalStatus | null {
  if (!meta || typeof meta !== "object") return null;
  return isSignalStatus(meta.signal_status) ? meta.signal_status : null;
}

/** 상세·목록 공통 — gemini_metadata 우선, 없을 때만 DB 컬럼 fallback */
export function resolveDisclosureSignalStatus(item: {
  signal_status?: string | null;
  gemini_metadata?: Record<string, unknown> | null;
}): SignalStatus {
  const fromMeta = readSignalFromGeminiMetadata(item.gemini_metadata);
  if (fromMeta) return fromMeta;
  if (isSignalStatus(item.signal_status)) return item.signal_status;
  return DEFAULT_SIGNAL_STATUS;
}

export function signalStatusFromForm(value: FormDataEntryValue | null): SignalStatus {
  return parseSignalStatus(String(value ?? ""));
}

export function disclosureWithResolvedSignal(item: DisclosureWithStock): DisclosureWithStock {
  return { ...item, signal_status: resolveDisclosureSignalStatus(item) };
}
