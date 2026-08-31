/**
 * Toss day-change can be unadjusted around a reverse split (액면병합).
 * A 1-for-20 shows as last/base ≈ 20 → +1900%, which is not a real move.
 */

const MIN_MULTIPLE = 4;
const MAX_MULTIPLE = 250;
const RATIO_TOLERANCE = 0.03;

function isSplitMultiple(multiple: number): boolean {
  if (!Number.isFinite(multiple) || multiple < MIN_MULTIPLE - 0.05) return false;
  const n = Math.round(multiple);
  if (n < MIN_MULTIPLE || n > MAX_MULTIPLE) return false;
  return Math.abs(multiple - n) / n <= RATIO_TOLERANCE;
}

/** Toss last vs previous close (or ranking basePrice). */
export function looksLikeUnadjustedReverseSplit(opts: {
  changePct?: number | null;
  lastPrice?: number | null;
  basePrice?: number | null;
}): boolean {
  const last = opts.lastPrice;
  const base = opts.basePrice;
  if (last != null && base != null && last > 0 && base > 0 && isSplitMultiple(last / base)) {
    return true;
  }

  const pct = opts.changePct;
  if (pct == null || !Number.isFinite(pct)) return false;

  if (pct >= (MIN_MULTIPLE - 1) * 100 - 1) {
    return isSplitMultiple(1 + pct / 100);
  }
  if (pct <= -50) {
    const remain = 1 + pct / 100;
    if (!(remain > 0)) return false;
    return isSplitMultiple(1 / remain);
  }
  return false;
}

export function hideSplitDistortedPct(
  changePct: number | null | undefined,
  lastPrice?: number | null,
  basePrice?: number | null
): number | null {
  if (changePct == null || !Number.isFinite(changePct)) return null;
  if (looksLikeUnadjustedReverseSplit({ changePct, lastPrice, basePrice })) return null;
  return changePct;
}
