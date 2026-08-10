const ET = "America/New_York";

function tzParts(ms: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));

  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
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

/** Parse NASDAQ RSS halt wall time (ET) → UTC epoch ms. */
export function parseHaltEtMs(haltDate: string, haltTime: string): number | null {
  const dm = haltDate.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!dm) return null;
  const month = Number(dm[1]);
  const day = Number(dm[2]);
  const year = Number(dm[3]);

  const timeClean = haltTime.trim().replace(/\.\d+$/, "") || "00:00:00";
  const [hStr, mStr, sStr] = timeClean.split(":");
  const hour = Number(hStr);
  const minute = Number(mStr);
  const second = Number(sStr ?? "0");
  if (![year, month, day, hour, minute, second].every((n) => Number.isFinite(n))) return null;

  let utc = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 4; i++) {
    const p = tzParts(utc);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const want = Date.UTC(year, month - 1, day, hour, minute, second);
    utc += want - asUtc;
  }
  return utc;
}

export function isLudpReason(reasonCode: string): boolean {
  const c = reasonCode.toUpperCase();
  return c.includes("LUDP") || c.startsWith("VI_");
}

/** "XX분 XX초" from start→end (or start→now). */
export function formatElapsedKo(startMs: number, endMs: number): string {
  const totalSec = Math.max(0, Math.floor((endMs - startMs) / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}분 ${String(secs).padStart(2, "0")}초`;
}

/**
 * LUDP elapsed end timestamp:
 * - trade resume time set → freeze at resume (RSS delay 보정: 재개−정지)
 * - otherwise → live now
 */
export function ludpElapsedEndMs(
  row: {
    haltDate: string;
    resumptionDate?: string | null;
    resumptionTradeTime?: string | null;
  },
  nowMs: number
): number {
  const tradeTime = (row.resumptionTradeTime ?? "").trim();
  if (!tradeTime) return nowMs;
  const date = (row.resumptionDate ?? "").trim() || row.haltDate;
  return parseHaltEtMs(date, tradeTime) ?? nowMs;
}

/** Sort key for halt rows: prefer absolute ISO, else ET wall clock. */
export function haltEventMs(row: {
  haltDate: string;
  haltTime: string;
  eventAtIso?: string | null;
}): number {
  if (row.eventAtIso) {
    const t = Date.parse(row.eventAtIso);
    if (Number.isFinite(t)) return t;
  }
  return parseHaltEtMs(row.haltDate, row.haltTime) ?? 0;
}

export type LocalDateTimeParts = {
  time: string;
  date: string;
  /** true when neither date nor time was available */
  empty: boolean;
};

function localPartsFromMs(ms: number): { time: string; date: string } {
  const d = new Date(ms);
  const map: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }

  const hour = (map.hour === "24" ? "00" : map.hour).padStart(2, "0");
  const minute = (map.minute ?? "00").padStart(2, "0");
  const second = (map.second ?? "00").padStart(2, "0");
  const year = map.year ?? "0000";
  const month = (map.month ?? "01").padStart(2, "0");
  const day = (map.day ?? "01").padStart(2, "0");

  return {
    time: `${hour}:${minute}:${second}`,
    date: `${year}-${month}-${day}`,
  };
}

/**
 * Convert NASDAQ RSS ET wall clock (MM/DD/YYYY + HH:mm:ss[.mmm])
 * to the viewer's local timezone for display.
 */
export function formatEtWallToLocal(
  etDate: string | null | undefined,
  etTime: string | null | undefined
): LocalDateTimeParts {
  const date = (etDate ?? "").trim();
  const time = (etTime ?? "").trim();
  if (!date && !time) {
    return { time: "미정", date: "", empty: true };
  }
  if (!date) {
    return { time: "미정", date: "", empty: true };
  }

  const ms = parseHaltEtMs(date, time || "00:00:00");
  if (ms == null) {
    return { time: "미정", date: "", empty: true };
  }

  const parts = localPartsFromMs(ms);
  return { ...parts, empty: false };
}
