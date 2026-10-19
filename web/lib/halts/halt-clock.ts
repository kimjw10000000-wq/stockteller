/** 재개 시각을 모를 때 화면에 보여주는 한 칸. 끝나면 같은 길이로 다시 시작한다. */
export const HALT_SLOT_MS = 5 * 60 * 1000;

/** 오늘 미국 동부 날짜가 아닌 재개 카드를 남겨 두는 시간. */
export const RESUMED_KEEP_MS = 30 * 60 * 1000;

function etDateKey(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

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

/** 오늘 미국장 날짜에 걸린 정지는 재개 뒤에도 그 날짜가 끝날 때까지 카드를 남긴다. */
export function keepResumedCard(haltedAt: number, resumedAt: number | null, now: number): boolean {
  if (resumedAt == null) return false;
  if (haltedAt > 0 && etDateKey(haltedAt) === etDateKey(now)) return true;
  return stillShowResumed(resumedAt, now);
}
