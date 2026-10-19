/** 재개 시각을 모를 때 화면에 보여주는 한 칸. 끝나면 같은 길이로 다시 시작한다. */
export const HALT_SLOT_MS = 5 * 60 * 1000;

/** 재개된 카드는 이 시간 동안 화면에 남긴다. */
export const RESUMED_KEEP_MS = 30 * 60 * 1000;

export function countdownMs(haltedAt: number, now: number): number {
  const elapsed = Math.max(0, now - haltedAt);
  if (elapsed === 0) return HALT_SLOT_MS;
  const into = elapsed % HALT_SLOT_MS;
  return into === 0 ? HALT_SLOT_MS : HALT_SLOT_MS - into;
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function stillShowResumed(resumedAt: number | null, now: number): boolean {
  if (resumedAt == null) return false;
  return now - resumedAt < RESUMED_KEEP_MS;
}
