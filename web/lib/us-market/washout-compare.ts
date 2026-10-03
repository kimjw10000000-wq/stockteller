import {
  runnerTapeDate,
  sessionBounds,
  sessionLengthMin,
  tapeDatesBack,
  type UsTradingSession,
} from "./us-session";

export { sessionBounds };

export type WashoutCompareSample = {
  t: number;
  v: number;
  tape_date?: string;
};

export type WashoutComparePath = {
  yesterday: Array<{ t: number; v: number }>;
  avg5: Array<{ t: number; v: number }>;
  avg20: Array<{ t: number; v: number }>;
};

export type WashoutCompare = {
  session: UsTradingSession | null;
  yesterday: number | null;
  avg5: number | null;
  avg20: number | null;
  days5: number;
  days20: number;
  /** 비교에 쓴 시각. 지금이 그 세션 안이면 현재 시각. */
  at?: number;
  paths: WashoutComparePath;
};

const MATCH_SLACK_MS = 15 * 60_000;

export function tapeSessionAtMs(t: number, tapeYmd: string): UsTradingSession | null {
  for (const session of ["afterhours", "premarket", "regular"] as UsTradingSession[]) {
    const { start, end } = sessionBounds(tapeYmd, session);
    if (t >= start && t < end) return session;
  }
  return null;
}

/** 한 칸의 가로를 그 세션 길이로 채운다. 다른 세션 시각은 -1. */
export function sessionSlotX(
  t: number,
  tapeYmd: string,
  dayIndex: number,
  dayCount: number,
  session: UsTradingSession,
  byDay: boolean
): number {
  if (dayCount <= 0 || dayIndex < 0 || dayIndex >= dayCount) return -1;
  if (tapeSessionAtMs(t, tapeYmd) !== session) return -1;
  if (byDay) return dayCount === 1 ? 1 : dayIndex / (dayCount - 1);
  const span = sessionLengthMin(session);
  const { start } = sessionBounds(tapeYmd, session);
  const elapsed = Math.min(span, Math.max(0, (t - start) / 60_000));
  return (dayIndex * span + elapsed) / (dayCount * span);
}

function sampleTape(row: WashoutCompareSample): string {
  const taped = (row.tape_date ?? "").slice(0, 10);
  return taped || runnerTapeDate(new Date(row.t));
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

type MinuteBucket = { t: number; v: number };

/** tape·세션·경과분 → 그 분의 점수. 같은 시각 비교가 전체 기록을 다시 훑지 않게 한다. */
function indexByElapsedMinute(samples: WashoutCompareSample[]): Map<string, MinuteBucket> {
  const index = new Map<string, MinuteBucket>();
  for (const row of samples) {
    if (!Number.isFinite(row.v)) continue;
    const tape = sampleTape(row);
    const session = tapeSessionAtMs(row.t, tape);
    if (!session) continue;
    const { start } = sessionBounds(tape, session);
    const minute = Math.floor((row.t - start) / 60_000);
    const key = `${tape}\0${session}\0${minute}`;
    const prev = index.get(key);
    if (!prev || row.t >= prev.t) index.set(key, { t: row.t, v: row.v });
  }
  return index;
}

function valueFromIndex(
  index: Map<string, MinuteBucket>,
  tapeYmd: string,
  session: UsTradingSession,
  elapsedMin: number
): number | null {
  const { start } = sessionBounds(tapeYmd, session);
  const target = start + elapsedMin * 60_000;
  const center = Math.floor(elapsedMin);
  const slackMin = MATCH_SLACK_MS / 60_000;
  let before: MinuteBucket | null = null;
  let after: { t: number; v: number; dt: number } | null = null;
  for (let minute = center - slackMin; minute <= center + slackMin + 1; minute++) {
    if (minute < 0) continue;
    const row = index.get(`${tapeYmd}\0${session}\0${minute}`);
    if (!row) continue;
    const dt = Math.abs(row.t - target);
    if (dt > MATCH_SLACK_MS) continue;
    if (row.t <= target) {
      if (!before || row.t > before.t) before = row;
    } else if (!after || dt < after.dt) {
      after = { t: row.t, v: row.v, dt };
    }
  }
  return (before ?? after)?.v ?? null;
}

export function valueAtSessionElapsed(
  samples: WashoutCompareSample[],
  tapeYmd: string,
  session: UsTradingSession,
  elapsedMin: number
): number | null {
  return valueFromIndex(indexByElapsedMinute(samples), tapeYmd, session, elapsedMin);
}

function resolveAnchor(
  samples: WashoutCompareSample[],
  atMs: number,
  tapeYmd: string
): { session: UsTradingSession; elapsedMin: number } | null {
  const liveSession = tapeSessionAtMs(atMs, tapeYmd);
  if (liveSession) {
    const { start } = sessionBounds(tapeYmd, liveSession);
    return { session: liveSession, elapsedMin: Math.max(0, (atMs - start) / 60_000) };
  }
  let last: WashoutCompareSample | null = null;
  for (const row of samples) {
    if (sampleTape(row) !== tapeYmd) continue;
    if (!tapeSessionAtMs(row.t, tapeYmd)) continue;
    if (row.t > atMs) continue;
    if (!last || row.t > last.t) last = row;
  }
  if (!last) return null;
  const session = tapeSessionAtMs(last.t, tapeYmd);
  if (!session) return null;
  const { start } = sessionBounds(tapeYmd, session);
  return { session, elapsedMin: Math.max(0, (last.t - start) / 60_000) };
}

/** 같은 세션·같은 경과분. 어제 / 최근 5일 / 최근 20일. */
export function washoutCompareAt(
  samples: WashoutCompareSample[],
  atMs: number,
  tapeYmd: string
): WashoutCompare {
  const empty: WashoutCompare = {
    session: null,
    yesterday: null,
    avg5: null,
    avg20: null,
    days5: 0,
    days20: 0,
    paths: { yesterday: [], avg5: [], avg20: [] },
  };
  const anchor = resolveAnchor(samples, atMs, tapeYmd);
  if (!anchor) return empty;
  const index = indexByElapsedMinute(samples);
  const prior = tapeDatesBack(tapeYmd, 21).slice(0, -1);
  const pick = (days: string[]) =>
    days
      .map((day) => valueFromIndex(index, day, anchor.session, anchor.elapsedMin))
      .filter((v): v is number => v != null);
  const last5 = pick(prior.slice(-5));
  const last20 = pick(prior.slice(-20));
  return {
    session: anchor.session,
    yesterday: pick(prior.slice(-1))[0] ?? null,
    avg5: mean(last5),
    avg20: mean(last20),
    days5: last5.length,
    days20: last20.length,
    paths: empty.paths,
  };
}

/** 오늘 각 시각과 같은 세션 경과분의 어제 / 5일 / 20일. t는 오늘 시각. */
export function washoutComparePaths(
  samples: WashoutCompareSample[],
  tapeYmd: string,
  todayPoints: Array<{ t: number }>
): WashoutComparePath {
  const prior = tapeDatesBack(tapeYmd, 21).slice(0, -1);
  const yDay = prior.at(-1);
  const last5 = prior.slice(-5);
  const last20 = prior.slice(-20);
  const index = indexByElapsedMinute(samples);
  const yesterday: Array<{ t: number; v: number }> = [];
  const avg5: Array<{ t: number; v: number }> = [];
  const avg20: Array<{ t: number; v: number }> = [];
  for (const point of todayPoints) {
    const session = tapeSessionAtMs(point.t, tapeYmd);
    if (!session) continue;
    const elapsedMin = (point.t - sessionBounds(tapeYmd, session).start) / 60_000;
    if (yDay) {
      const v = valueFromIndex(index, yDay, session, elapsedMin);
      if (v != null) yesterday.push({ t: point.t, v });
    }
    const a5 = mean(
      last5
        .map((day) => valueFromIndex(index, day, session, elapsedMin))
        .filter((v): v is number => v != null)
    );
    if (a5 != null) avg5.push({ t: point.t, v: a5 });
    const a20 = mean(
      last20
        .map((day) => valueFromIndex(index, day, session, elapsedMin))
        .filter((v): v is number => v != null)
    );
    if (a20 != null) avg20.push({ t: point.t, v: a20 });
  }
  return { yesterday, avg5, avg20 };
}
