import { etDayKey } from "./poll-window";

/** Last completed US session close: newest 1d candle whose ET date is before today. */
export function priorSessionClose(
  candles: Array<{ timestamp: string; close: number | null }>,
  now = new Date()
): number | null {
  const today = etDayKey(now);
  let prev: number | null = null;
  for (const c of candles) {
    if (c.close == null || !(c.close > 0) || !c.timestamp) continue;
    const ms = Date.parse(c.timestamp);
    if (!Number.isFinite(ms)) continue;
    if (etDayKey(new Date(ms)) < today) prev = c.close;
  }
  return prev;
}

/** Toss day-change % is only valid for the ET day it was fetched. */
export function isSameEtDay(iso: string | null | undefined, now = new Date()): boolean {
  if (!iso) return false;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  return etDayKey(new Date(ms)) === etDayKey(now);
}
