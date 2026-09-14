import {
  EASTERN_TIME_ZONE,
  getZonedParts,
  zonedWallTimeToUtc,
} from "@/lib/alerts/eastern-premarket";
import { etDayKey } from "@/lib/quotes/poll-window";

export type UsTradingSession = "premarket" | "regular" | "afterhours";

/** 04:00 / 09:30 / 16:00 / 20:00 은 EST·EDT 공통 벽시계. UTC-5/UTC-4를 나누지 않는다. */
const PRE_START = 4 * 60;
const REG_START = 9 * 60 + 30;
const AFT_START = 16 * 60;
const AFT_END = 20 * 60;

export function isUsWeekday(now = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    weekday: "short",
  }).format(now);
  return weekday !== "Sat" && weekday !== "Sun";
}

export function sessionFromEtMinutes(minutes: number): UsTradingSession | null {
  if (minutes >= PRE_START && minutes < REG_START) return "premarket";
  if (minutes >= REG_START && minutes < AFT_START) return "regular";
  if (minutes >= AFT_START && minutes < AFT_END) return "afterhours";
  return null;
}

export function sessionAtInstant(now = new Date()): UsTradingSession | null {
  const p = getZonedParts(now, EASTERN_TIME_ZONE);
  return sessionFromEtMinutes(p.hour * 60 + p.minute);
}

export function getUsTradingSession(now = new Date()): UsTradingSession | null {
  if (!isUsWeekday(now)) return null;
  return sessionAtInstant(now);
}

export function usSessionDateKey(now = new Date()): string {
  return etDayKey(now);
}

export function usEtYmd(now = new Date()): string {
  return etYmd(now);
}

/** 해당 ET 달력일의 프리마켓 시작(04:00). */
export function etPremarketStartMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return zonedWallTimeToUtc(y, m, d, 4, 0, 0, EASTERN_TIME_ZONE).getTime();
}

function etYmd(now: Date): string {
  const p = getZonedParts(now, EASTERN_TIME_ZONE);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function previousEtWeekday(ymd: string): string {
  let cur = addEtDays(ymd, -1);
  for (let i = 0; i < 4; i++) {
    const [y, m, d] = cur.split("-").map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (wd !== 0 && wd !== 6) return cur;
    cur = addEtDays(cur, -1);
  }
  return cur;
}

function addEtDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + delta));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
}

export function nextEtWeekday(ymd: string): string {
  let cur = addEtDays(ymd, 1);
  for (let i = 0; i < 4; i++) {
    const [y, m, d] = cur.split("-").map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (wd !== 0 && wd !== 6) return cur;
    cur = addEtDays(cur, 1);
  }
  return cur;
}

export function etWallMs(ymd: string, hour: number, minute = 0): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return zonedWallTimeToUtc(y, m, d, hour, minute, 0, EASTERN_TIME_ZONE).getTime();
}

/** 전날 애프터 4h + 오늘 프리 5.5h + 오늘 본장 6.5h */
export const TAPE_DAY_SESSION_MIN = 4 * 60 + 5.5 * 60 + 6.5 * 60;

export function tapeDayElapsedMin(t: number, tapeYmd: string): number {
  const prev = previousEtWeekday(tapeYmd);
  const ah0 = etWallMs(prev, 16, 0);
  const ah1 = etWallMs(prev, 20, 0);
  const pre0 = etWallMs(tapeYmd, 4, 0);
  const rth0 = etWallMs(tapeYmd, 9, 30);
  const rth1 = etWallMs(tapeYmd, 16, 0);
  if (t <= ah0) return 0;
  if (t < ah1) return (t - ah0) / 60_000;
  if (t < pre0) return 4 * 60;
  if (t < rth0) return 4 * 60 + (t - pre0) / 60_000;
  if (t < rth1) return 4 * 60 + 5.5 * 60 + (t - rth0) / 60_000;
  return TAPE_DAY_SESSION_MIN;
}

export function tapeDatesBack(tapeYmd: string, count: number): string[] {
  const out: string[] = [tapeYmd];
  let cur = tapeYmd;
  for (let i = 1; i < count; i++) {
    cur = previousEtWeekday(cur);
    out.push(cur);
  }
  out.reverse();
  return out;
}

export function isInTapeDay(t: number, tapeYmd: string): boolean {
  const prev = previousEtWeekday(tapeYmd);
  const ah0 = etWallMs(prev, 16, 0);
  const ah1 = etWallMs(prev, 20, 0);
  const pre0 = etWallMs(tapeYmd, 4, 0);
  const rth1 = etWallMs(tapeYmd, 16, 0);
  return (t >= ah0 && t < ah1) || (t >= pre0 && t < rth1);
}

/**
 * 급등 테이프 하루의 날짜 = 본장이 열리는 ET 달력일.
 * 전날 16:00–20:00 애프터는 이 날짜에 속하고, 오늘 16:00–20:00 애프터는 다음 테이프 하루.
 */
export function runnerTapeDate(now = new Date()): string {
  const p = getZonedParts(now, EASTERN_TIME_ZONE);
  const ymd = etYmd(now);
  const minutes = p.hour * 60 + p.minute;
  const session = sessionFromEtMinutes(minutes);
  if (session === "afterhours") return nextEtWeekday(ymd);
  if (minutes >= AFT_END) return nextEtWeekday(ymd);
  return ymd;
}

export function tapeSessionAt(
  now: Date,
  tapeYmd: string,
  prevTradingYmd: string
): UsTradingSession | null {
  const ymd = etYmd(now);
  const session = sessionAtInstant(now);
  if (ymd === prevTradingYmd && session === "afterhours") return "afterhours";
  if (ymd === tapeYmd && session === "premarket") return "premarket";
  if (ymd === tapeYmd && session === "regular") return "regular";
  return null;
}
