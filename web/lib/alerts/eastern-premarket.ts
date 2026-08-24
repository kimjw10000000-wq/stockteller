/**
 * 무료 티어 일일 알림 한도 윈도우.
 * 미국 동부(US Eastern, America/New_York) 매일 프리마켓 04:00 AM ET에 리셋.
 * 24시간 쿨타임이 아니라, 직전 04:00 ET 이후 1회.
 */

export const EASTERN_TIME_ZONE = "America/New_York";
export const PREMARKET_RESET_HOUR_ET = 4;

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  const hourRaw = map.hour === "24" ? "0" : map.hour;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(hourRaw),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function addCalendarDays(
  year: number,
  month: number,
  day: number,
  delta: number
): { year: number; month: number; day: number } {
  const utc = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

/** `date` 시점의 타임존 오프셋(ms). 양수면 그 존의 벽시계가 UTC보다 앞섬(미국은 음수). */
export function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const p = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

/** 특정 타임존의 벽시계 시각 → UTC Date (DST 포함). */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = new Date(utcGuess);
  let offset = getTimeZoneOffsetMs(instant, timeZone);
  instant = new Date(utcGuess - offset);
  offset = getTimeZoneOffsetMs(instant, timeZone);
  return new Date(utcGuess - offset);
}

function etDateAtHour(
  year: number,
  month: number,
  day: number,
  hour: number
): Date {
  return zonedWallTimeToUtc(year, month, day, hour, 0, 0, EASTERN_TIME_ZONE);
}

/** 현재 시각 기준 가장 최근(이미 지난) 04:00 AM ET. 지금이 정확히 04:00이면 그 시각. */
export function getLatestPremarketResetUtc(now: Date = new Date()): Date {
  const p = getZonedParts(now, EASTERN_TIME_ZONE);
  const reachedTodayReset = p.hour * 60 + p.minute >= PREMARKET_RESET_HOUR_ET * 60;
  const ymd = reachedTodayReset
    ? { year: p.year, month: p.month, day: p.day }
    : addCalendarDays(p.year, p.month, p.day, -1);
  return etDateAtHour(ymd.year, ymd.month, ymd.day, PREMARKET_RESET_HOUR_ET);
}

/** 다음 리셋 시각(04:00 AM ET). 지금이 정확히 리셋 시각이면 다음날 04:00. */
export function getNextPremarketResetUtc(now: Date = new Date()): Date {
  const latest = getLatestPremarketResetUtc(now);
  const p = getZonedParts(latest, EASTERN_TIME_ZONE);
  const tomorrow = addCalendarDays(p.year, p.month, p.day, 1);
  if (now.getTime() < latest.getTime()) return latest;
  return etDateAtHour(tomorrow.year, tomorrow.month, tomorrow.day, PREMARKET_RESET_HOUR_ET);
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 무료 티어가 이번 프리마켓 윈도우(직전 04:00 ET ~ 다음 03:59 ET)에서
 * 아직 알림을 보낼 수 있는지.
 */
export function canSendFreeAlertThisWindow(
  lastTriggeredAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  const last = asDate(lastTriggeredAt);
  if (!last) return true;
  return last.getTime() < getLatestPremarketResetUtc(now).getTime();
}

export function canDispatchDilutionAlert(options: {
  isPro: boolean;
  lastTriggeredAt: Date | string | null | undefined;
  now?: Date;
}): boolean {
  if (options.isPro) return true;
  return canSendFreeAlertThisWindow(options.lastTriggeredAt, options.now ?? new Date());
}
