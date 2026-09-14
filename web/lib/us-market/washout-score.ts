import { getUsTradingSession, sessionAtInstant } from "./us-session";

/**
 * Washout score on drawdown from the peak price.
 * dd% = (peak − price) / peak × 100. Gate is still +TRACK_PCT vs previous RTH close.
 * A down segment from dd A to B (A < B) paints slope×drawdown: (B−A)/dt × (B−A).
 * On 1-minute close-to-close that is (B−A)². The bar that prints a new peak uses
 * dt = (closeAt − peakAt) seconds / 60 instead of a full minute.
 * Bounce only reads the envelope at the current dd. Overlapping dd ranges keep
 * the steeper paint. A new running peak wipes the envelope and score; calculation
 * starts again from that high (peak-minute uses second dt).
 *
 * Running peak (max high since +TRACK_PCT) is the only price reference.
 * A candle's own high is not a drawdown origin unless it makes a new running peak.
 * Session clock (pre / RTH / AH only) starts at 12 hours and keeps running even
 * if the name drops back under +30% vs the same previous close. After the RTH
 * close (AH belongs to the next tape day), a new +30% vs that new close restarts
 * the 12-hour clock. Dipping under +30% and recrossing the same close does not.
 */

export const WASHOUT_TRACK_PCT = 30;
export const WASHOUT_TRACK_SESSION_HOURS = 12;
export const WASHOUT_TRACK_SESSION_MIN = WASHOUT_TRACK_SESSION_HOURS * 60;
const TENTHS = 10;
const SESSION_GAP_MIN = 3;

export type WashoutBar = {
  t: number;
  price: number;
  open?: number;
  high?: number;
  prevClose?: number;
  /** Epoch ms of the bar high (second precision). Peak bar only. */
  peakAt?: number;
  /** Epoch ms of the last print / close in the bar. */
  closeAt?: number;
};

export type WashoutPoint = {
  t: number;
  price: number;
  peakPrice: number;
  ddPct: number;
  minuteChange: number;
  minuteScore: number;
  score: number;
  tracking: boolean;
  sessionElapsedMin: number;
  sessionQuotaMin: number;
};

export type WashoutIndexPoint = {
  t: number;
  score: number;
};

export function sessionStepMinutes(prevT: number, t: number): number {
  if (!getUsTradingSession(new Date(t))) return 0;
  if (prevT < 0 || t <= prevT) return 1;
  const gap = (t - prevT) / 60_000;
  if (gap > SESSION_GAP_MIN) return 1;
  return Math.max(gap, 1 / 60);
}

export function cappedBarDtMinutes(prevT: number, t: number): number {
  if (prevT < 0 || t <= prevT) return 1;
  const gap = (t - prevT) / 60_000;
  if (gap > SESSION_GAP_MIN) return 1;
  return Math.max(gap, 1 / 60);
}

/** Peak-bar dt in minutes from high timestamp to close. Floor 1 second. */
export function peakBarDtMinutes(peakAt: number, closeAt: number): number {
  const seconds = (closeAt - peakAt) / 1000;
  if (!Number.isFinite(seconds) || seconds <= 0) return 1 / 60;
  return Math.max(seconds / 60, 1 / 60);
}

export function drawdownPct(peakPrice: number, price: number): number {
  if (peakPrice <= 0) return 0;
  return Math.max(0, ((peakPrice - price) / peakPrice) * 100);
}

function keyOf(pct: number): number {
  return Math.round(pct * TENTHS);
}

function pctOf(key: number): number {
  return key / TENTHS;
}

export function lookupDd(grid: Map<number, number>, ddPct: number): number {
  if (grid.size === 0) return 0;
  const k = keyOf(ddPct);
  const exact = grid.get(k);
  if (exact != null) return exact;
  let lo: number | null = null;
  let hi: number | null = null;
  for (const key of grid.keys()) {
    if (key <= k && (lo == null || key > lo)) lo = key;
    if (key >= k && (hi == null || key < hi)) hi = key;
  }
  if (lo == null && hi == null) return 0;
  if (lo == null) return grid.get(hi as number) ?? 0;
  if (hi == null) return grid.get(lo) ?? 0;
  if (lo === hi) return grid.get(lo) ?? 0;
  const a = grid.get(lo) ?? 0;
  const b = grid.get(hi) ?? 0;
  const t = (k - lo) / (hi - lo);
  return a + (b - a) * t;
}

/** Paint increasing drawdown A → B. B > A. Steeper existing values kept. */
export function paintDown(
  grid: Map<number, number>,
  fromDd: number,
  toDd: number,
  dtMinutes = 1
): number {
  const drop = toDd - fromDd;
  if (drop <= 0) return lookupDd(grid, toDd);
  const dt = Math.max(dtMinutes, 1 / 60);
  const rate = drop / dt;
  const startScore = lookupDd(grid, fromDd);
  const fromK = keyOf(fromDd);
  const toK = keyOf(toDd);
  let lastScore = startScore;
  let lastK = fromK;
  for (let k = fromK; k <= toK; k++) {
    const p = pctOf(k);
    const proposed = startScore + rate * (p - fromDd);
    const existing = grid.get(k);
    if (existing == null) {
      const filled = lastScore + rate * (pctOf(k) - pctOf(lastK));
      grid.set(k, filled);
      lastScore = filled;
      lastK = k;
    } else if (proposed > existing) {
      grid.set(k, proposed);
      lastScore = proposed;
      lastK = k;
    } else {
      lastScore = existing;
      lastK = k;
    }
  }
  return lookupDd(grid, toDd);
}

type WashoutState = WashoutPoint & {
  prevPrice: number;
  grid: Map<number, number>;
  prevClose: number;
  wasAboveGate: boolean;
  recaptureArmed: boolean;
};

function idleState(
  bar: WashoutBar,
  close: number,
  grid: Map<number, number>,
  prevClose: number,
  wasAboveGate: boolean
): WashoutState {
  return {
    t: bar.t,
    price: close,
    peakPrice: 0,
    ddPct: 0,
    minuteChange: 0,
    minuteScore: 0,
    score: 0,
    tracking: false,
    sessionElapsedMin: 0,
    sessionQuotaMin: 0,
    prevPrice: close,
    grid,
    prevClose,
    wasAboveGate,
    recaptureArmed: false,
  };
}

function crossesSession(prevT: number, t: number): boolean {
  if (prevT < 0 || t <= prevT) return false;
  if ((t - prevT) / 60_000 > SESSION_GAP_MIN) return true;
  const a = sessionAtInstant(new Date(prevT));
  const b = sessionAtInstant(new Date(t));
  return a != null && b != null && a !== b;
}

function nextState(prev: WashoutState, bar: WashoutBar): WashoutState {
  const close = bar.price;
  const open = bar.open ?? prev.prevPrice;
  const sessionJump = crossesSession(prev.t, bar.t);
  const candleHigh = sessionJump ? Math.max(open, close) : bar.high ?? Math.max(open, close);
  const gateHigh = bar.high ?? Math.max(open, close);
  let {
    peakPrice,
    score,
    tracking,
    grid,
    prevClose,
    sessionElapsedMin,
    sessionQuotaMin,
    wasAboveGate,
    recaptureArmed,
  } = prev;
  const prevPrice = prev.prevPrice;

  const pc = bar.prevClose ?? prevClose;
  if (pc !== prevClose) {
    prevClose = pc;
    wasAboveGate = false;
    if (tracking) recaptureArmed = true;
  }
  const gate = prevClose > 0 ? (gateHigh / prevClose - 1) * 100 : 0;
  const above = gate >= WASHOUT_TRACK_PCT;

  if (tracking && sessionElapsedMin >= sessionQuotaMin) {
    tracking = false;
    peakPrice = 0;
    score = 0;
    grid = new Map();
    sessionElapsedMin = 0;
    sessionQuotaMin = 0;
    wasAboveGate = above;
    recaptureArmed = false;
  }

  let resetPeak = false;
  if (!tracking) {
    if (!above) return idleState(bar, close, grid, prevClose, false);
    if (wasAboveGate) return idleState(bar, close, grid, prevClose, true);
    tracking = true;
    peakPrice = candleHigh;
    grid = new Map();
    score = 0;
    sessionElapsedMin = 0;
    sessionQuotaMin = WASHOUT_TRACK_SESSION_MIN;
    wasAboveGate = true;
    recaptureArmed = false;
    resetPeak = true;
  } else if (tracking && recaptureArmed && above) {
    sessionElapsedMin = 0;
    sessionQuotaMin = WASHOUT_TRACK_SESSION_MIN;
    recaptureArmed = false;
    wasAboveGate = true;
  } else {
    wasAboveGate = above;
  }

  if (candleHigh > peakPrice) {
    peakPrice = candleHigh;
    grid = new Map();
    score = 0;
    resetPeak = true;
  }

  const toDd = drawdownPct(peakPrice, close);
  const fromDd = resetPeak
    ? 0
    : sessionJump
      ? drawdownPct(peakPrice, open)
      : drawdownPct(peakPrice, prevPrice);
  const closeAt = bar.closeAt ?? bar.t + 60_000;
  const dtMinutes = resetPeak
    ? peakBarDtMinutes(bar.peakAt ?? bar.t, closeAt)
    : cappedBarDtMinutes(prev.t, bar.t);
  const before = score;
  if (toDd > fromDd) {
    score = paintDown(grid, fromDd, toDd, dtMinutes);
  } else {
    score = lookupDd(grid, toDd);
  }

  sessionElapsedMin += sessionStepMinutes(prev.t, bar.t);

  return {
    t: bar.t,
    price: close,
    peakPrice,
    ddPct: toDd,
    minuteChange: toDd - fromDd,
    minuteScore: score - before,
    score,
    tracking: true,
    sessionElapsedMin,
    sessionQuotaMin,
    prevPrice: close,
    grid,
    prevClose,
    wasAboveGate,
    recaptureArmed,
  };
}

/** 추적 중 새 고점이 난 분봉 인덱스. 이 분만 초봉 dt를 쓴다. */
export function peakResetIndices(points: WashoutPoint[]): number[] {
  const out: number[] = [];
  let peak = 0;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (!point.tracking) {
      peak = 0;
      continue;
    }
    if (point.peakPrice > peak) {
      out.push(i);
      peak = point.peakPrice;
    }
  }
  return out;
}

export function washoutScoreSeries(
  bars: WashoutBar[],
  prevClose: number
): WashoutPoint[] {
  let state: WashoutState = {
    t: -1,
    price: prevClose,
    peakPrice: 0,
    ddPct: 0,
    minuteChange: 0,
    minuteScore: 0,
    score: 0,
    tracking: false,
    sessionElapsedMin: 0,
    sessionQuotaMin: 0,
    prevPrice: prevClose,
    grid: new Map(),
    prevClose,
    wasAboveGate: false,
    recaptureArmed: false,
  };
  const out: WashoutPoint[] = [];
  for (const bar of bars) {
    state = nextState(state, bar);
    out.push({
      t: state.t,
      price: state.price,
      peakPrice: state.peakPrice,
      ddPct: state.ddPct,
      minuteChange: state.minuteChange,
      minuteScore: state.minuteScore,
      score: state.score,
      tracking: state.tracking,
      sessionElapsedMin: state.sessionElapsedMin,
      sessionQuotaMin: state.sessionQuotaMin,
    });
  }
  return out;
}

export function lastWashoutScore(bars: WashoutBar[], prevClose: number): number {
  const series = washoutScoreSeries(bars, prevClose);
  return series.length ? series[series.length - 1].score : 0;
}

/** 설거지 지수에 넣는 종목 점수. 원점수는 그대로 두고, 무릎 3500에서 눕혀 천장 5600. */
export const WASHOUT_INDEX_CAP_S = 5600;
export const WASHOUT_INDEX_CAP_P = 8;

export function washoutScoreForIndex(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  const u = score / WASHOUT_INDEX_CAP_S;
  return WASHOUT_INDEX_CAP_S * (u / (1 + u ** WASHOUT_INDEX_CAP_P) ** (1 / WASHOUT_INDEX_CAP_P));
}

/** 설거지 지수 = 추적 중 종목 원점수를 소프트캡한 뒤 산술평균. */
export function washoutIndexAverage(scores: number[]): number {
  if (!scores.length) return 0;
  let sum = 0;
  for (const n of scores) sum += washoutScoreForIndex(n);
  return sum / scores.length;
}

const MINUTE_MS = 60_000;

/** 분 단위로 맞춰, 그 시각에 추적 중인 종목 점수의 평균 시계열. */
export function washoutIndexPath(seriesList: WashoutPoint[][]): WashoutIndexPoint[] {
  const keys = new Set<number>();
  for (const series of seriesList) {
    for (const point of series) keys.add(Math.floor(point.t / MINUTE_MS));
  }
  const ordered = [...keys].sort((a, b) => a - b);
  const cursors = seriesList.map(() => 0);
  const last: Array<WashoutPoint | null> = seriesList.map(() => null);
  const out: WashoutIndexPoint[] = [];
  for (const k of ordered) {
    for (let i = 0; i < seriesList.length; i++) {
      const series = seriesList[i];
      while (cursors[i] < series.length && Math.floor(series[cursors[i]].t / MINUTE_MS) <= k) {
        last[i] = series[cursors[i]];
        cursors[i]++;
      }
    }
    const scores: number[] = [];
    let t = k * MINUTE_MS;
    for (const point of last) {
      if (point?.tracking) {
        scores.push(point.score);
        if (point.t > t) t = point.t;
      }
    }
    out.push({ t, score: washoutIndexAverage(scores) });
  }
  return out;
}
