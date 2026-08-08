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
  return reasonCode.toUpperCase().includes("LUDP");
}

/** "XX분 XX초" count-up from halt start. */
export function formatElapsedKo(haltMs: number, nowMs: number): string {
  const totalSec = Math.max(0, Math.floor((nowMs - haltMs) / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}분 ${String(secs).padStart(2, "0")}초`;
}
