import {
  addSessionMinutes,
  etWallMs,
  getUsTradingSession,
  runnerTapeDate,
  sessionAtInstant,
  sessionMinutesBetween,
  TAPE_DAY_SESSION_MIN,
  usEtYmd,
} from "./us-session";

/**
 * 설거지 점수. dd% = (고점 − 가격) / 고점 × 100. 게이트는 전일 종가 대비 +TRACK_PCT.
 *
 * 고점이 난 분: 최고점 초 → 그 분봉의 끝. dt = 초/60분, (Δdd)² / dt.
 * 이후 분: 고점 미갱신 시 시가 vs 종가만. 하락이면 (B−A)² 를 낙폭 구간에 일차함수로 칠하고
 * 겹치면 가파른 쪽. 반등은 함수를 읽음. 낙폭 0 또는 최고점 경신이면 격자·점수 리셋.
 * 본장에서 분봉이 3분 넘게 비면 서킷 재개로 보고, 그 재개 분의 시작가는 정지 직전 분 종가.
 *
 * 세션 시계(전날 애프터 / 오늘 프리 / 오늘 본장). 구간 합·고점은 그 세션만.
 * 포착: 세션마다 전일 종가 대비 +30% 그리고 그 첫 +30% 분봉 거래대금 ≥ $10,000.
 * 세션이 바뀌면 고점·격자·점수는 버린다. 추적시간만, 다음 세션 시작 30분 안에 다시 포착되면 이어 붙인다.
 * 본장→애프터(다음 테이프)는 30분 없이 전부 폐기. 추적시간 합 상한은 테이프 하루 16시간.
 * 지수: 개별 점수 × 간격필터(이어진 추적시작→이 세션 고점) → 상한 → 이 세션에서 추적을 시작한 종목 평균.
 */

export const WASHOUT_TRACK_PCT = 30;
export const WASHOUT_TRACK_SESSION_HOURS = 12;
export const WASHOUT_TRACK_SESSION_MIN = WASHOUT_TRACK_SESSION_HOURS * 60;
/** 다음 세션 시작 후 이 시간 안에 재포착되면 추적시간을 이어 붙인다. */
export const WASHOUT_SESSION_CARRY_MIN = 30;
/** 포착·재포착 분봉 거래대금. Polygon vwap×volume. */
export const WASHOUT_CAPTURE_NOTIONAL_USD = 10_000;
/** 직전 본장 고가 / 전일 종가. */
export const WASHOUT_SPECIAL_RTH_HIGH_PCT = 900;
const TENTHS = 10;
const SESSION_GAP_MIN = 3;
const MINUTE_MS = 60_000;

/** 추적 시작 = 고점 시각 1분 전. 그 고점이 창 밖으로 빠지지 않게. */
export function trackingOriginMs(peakAt: number): number {
  return peakAt - MINUTE_MS;
}

export type WashoutBar = {
  t: number;
  price: number;
  open?: number;
  high?: number;
  low?: number;
  prevClose?: number;
  /** 분봉 거래량(주). 없으면 대금 필터를 건너뛴다. */
  volume?: number;
  /** 분봉 VWAP. 있으면 거래대금 = vwap×volume. */
  vwap?: number;
  /** Epoch ms of the bar high (second precision). Peak bar only. */
  peakAt?: number;
  closeAt?: number;
};

export function barNotionalUsd(bar: WashoutBar): number | null {
  const volume = bar.volume;
  if (volume == null || !Number.isFinite(volume) || volume < 0) return null;
  const px = bar.vwap != null && Number.isFinite(bar.vwap) && bar.vwap > 0 ? bar.vwap : bar.price;
  if (!Number.isFinite(px) || px <= 0) return 0;
  return px * volume;
}

export function meetsWashoutCapture(bar: WashoutBar, prevClose: number): boolean {
  if (!(prevClose > 0)) return false;
  const high = bar.high ?? Math.max(bar.open ?? bar.price, bar.price);
  if ((high / prevClose - 1) * 100 < WASHOUT_TRACK_PCT) return false;
  const notional = barNotionalUsd(bar);
  if (notional == null) return true;
  return notional >= WASHOUT_CAPTURE_NOTIONAL_USD;
}

/** 앱장 시작(16:00)부터 20:00까지 남은 세션 분. 앱장이 아니면 0. */
export function remainingAfterhoursMinutes(atMs: number): number {
  if (sessionAtInstant(new Date(atMs)) !== "afterhours") return 0;
  const end = etWallMs(usEtYmd(new Date(atMs)), 20, 0);
  return Math.max(0, sessionMinutesBetween(atMs, end));
}

export function specialTickersAfterRth(
  rows: Array<{ ticker: string; high: number; close: number; prevClose: number }>
): Set<string> {
  const out = new Set<string>();
  let best = -Infinity;
  const leaders: string[] = [];
  for (const row of rows) {
    if (!(row.prevClose > 0) || !row.ticker) continue;
    if ((row.high / row.prevClose - 1) * 100 >= WASHOUT_SPECIAL_RTH_HIGH_PCT) out.add(row.ticker);
    const closePct = (row.close / row.prevClose - 1) * 100;
    if (!Number.isFinite(closePct)) continue;
    if (closePct > best + 1e-9) {
      best = closePct;
      leaders.length = 0;
      leaders.push(row.ticker);
    } else if (Math.abs(closePct - best) <= 1e-9) {
      leaders.push(row.ticker);
    }
  }
  if (Number.isFinite(best)) for (const ticker of leaders) out.add(ticker);
  return out;
}

export type WashoutScoreOpts = {
  seedPeak?: number;
  savedPeakAt?: number;
  grantedOn?: string;
  /** 이 ET 달력일의 앱장 포착이면 12h+앱장 잔여. */
  specialAhYmds?: Set<string> | string[];
};

function specialAhDays(opts?: WashoutScoreOpts): Set<string> | null {
  if (!opts?.specialAhYmds) return null;
  return opts.specialAhYmds instanceof Set ? opts.specialAhYmds : new Set(opts.specialAhYmds);
}

function ahQuotaForGrant(barT: number, opts?: WashoutScoreOpts): number {
  const days = specialAhDays(opts);
  if (!days) return WASHOUT_TRACK_SESSION_MIN;
  if (sessionAtInstant(new Date(barT)) !== "afterhours") return WASHOUT_TRACK_SESSION_MIN;
  if (!days.has(usEtYmd(new Date(barT)))) return WASHOUT_TRACK_SESSION_MIN;
  return WASHOUT_TRACK_SESSION_MIN + remainingAfterhoursMinutes(barT);
}

export type WashoutPoint = {
  t: number;
  price: number;
  peakPrice: number;
  /** Epoch ms of the running high (second). */
  peakAt: number;
  /** 이어진 추적의 첫 포착 분. 30분 브리지가 있으면 이전 세션 시각. */
  captureAt: number;
  /** 이 세션에서 추적을 시작한 분. 지수 멤버십. 추적 중이 아니면 0. */
  sessionCaptureAt?: number;
  ddPct: number;
  minuteChange: number;
  minuteScore: number;
  score: number;
  tracking: boolean;
  sessionElapsedMin: number;
  sessionQuotaMin: number;
  /** 이 세션 고점이 찍힐 때까지의 이어진 추적 분. 간격 곱. */
  peakElapsedMin?: number;
  /** 포착 분봉 거래대금(USD). 추적 중이 아니면 0. */
  captureNotionalUsd?: number;
  captureVolume?: number;
  captureVwap?: number;
  /** sessionElapsed+빈 분이 quota에 닿는 시각. 지수 멤버십 O(1)용. */
  trackUntilMs?: number;
};

export type WashoutIndexName = {
  score: number;
  captureAt?: number;
  peakAt?: number;
  peakElapsedMin?: number;
};

export type WashoutIndexPoint = {
  t: number;
  score: number;
};

export type WashoutEngineState = WashoutPoint & {
  prevPrice: number;
  grid: Map<number, number>;
  prevClose: number;
  wasAboveGate: boolean;
  recaptureArmed: boolean;
  /** 테이프 날짜. 라이브 유니버스용. 세션 재포착은 막지 않는다. */
  grantDay: string;
  carryElapsedMin: number;
  carryCaptureAt: number;
  carryUntilMs: number;
};

/** 해당 시각이 속한 세션의 ET 시작. */
export function sessionStartMs(t: number): number | null {
  const session = sessionAtInstant(new Date(t));
  if (!session) return null;
  const ymd = usEtYmd(new Date(t));
  if (session === "premarket") return etWallMs(ymd, 4, 0);
  if (session === "regular") return etWallMs(ymd, 9, 30);
  return etWallMs(ymd, 16, 0);
}

type TapeLink = "none" | "bridge" | "new-tape";

function tapeLink(prevT: number, t: number): TapeLink {
  if (prevT < 0 || t <= prevT) return "none";
  const a = sessionAtInstant(new Date(prevT));
  const b = sessionAtInstant(new Date(t));
  if (b == null) return "none";
  const tapeA = runnerTapeDate(new Date(prevT));
  const tapeB = runnerTapeDate(new Date(t));
  if (tapeA !== tapeB) return "new-tape";
  if (a === b) return "none";
  if (a === "afterhours" && (b === "premarket" || b === "regular")) return "bridge";
  if (a === "premarket" && b === "regular") return "bridge";
  return "new-tape";
}

export function washoutPointInSessionIndex(
  point: WashoutPoint | null | undefined,
  atMs: number
): boolean {
  if (!stillTrackingAt(point, atMs)) return false;
  const started = point.sessionCaptureAt || 0;
  if (!(started > 0)) return true;
  if (runnerTapeDate(new Date(started)) !== runnerTapeDate(new Date(atMs))) return false;
  return sessionAtInstant(new Date(started)) === sessionAtInstant(new Date(atMs));
}

/** 거래 가능 분만 한도에 넣는다. 체결이 드문 종목도 빈 분을 1분으로 접지 않는다. */
function trackElapsedStep(prevT: number, t: number): number {
  if (!getUsTradingSession(new Date(t))) return 0;
  if (prevT < 0 || t <= prevT) return 1 / 60;
  return Math.max(sessionMinutesBetween(prevT, t), 1 / 60);
}

export function trackingEndsAt(t: number, elapsedMin: number, quotaMin: number): number {
  const remain = quotaMin - elapsedMin;
  if (!(remain > 0)) return t;
  return addSessionMinutes(t, remain);
}

export function stillTrackingAt(point: WashoutPoint | null | undefined, atMs: number): boolean {
  if (!point?.tracking) return false;
  if (point.trackUntilMs != null && point.trackUntilMs > 0) return atMs < point.trackUntilMs;
  const extra = atMs > point.t ? sessionMinutesBetween(point.t, atMs) : 0;
  return point.sessionElapsedMin + extra < point.sessionQuotaMin;
}

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

/** 고점 초 → 그 분봉 끝. 최소 1초. */
export function peakBarDtMinutes(peakAt: number, barEnd: number): number {
  const seconds = (barEnd - peakAt) / 1000;
  if (!Number.isFinite(seconds) || seconds <= 0) return 1 / 60;
  return Math.max(seconds / 60, 1 / 60);
}

export function minuteBarEnd(barT: number): number {
  return barT + MINUTE_MS;
}

export function applySeedPeak(bars: WashoutBar[], seedPeak: number): WashoutBar[] {
  if (!Number.isFinite(seedPeak) || seedPeak <= 0 || bars.length === 0) return bars;
  let bestI = 0;
  let bestH = -Infinity;
  for (let i = 0; i < bars.length; i++) {
    const h = bars[i].high ?? bars[i].price;
    if (h > bestH) {
      bestH = h;
      bestI = i;
    }
  }
  if (seedPeak <= bestH) return bars;
  const copy = bars.slice();
  copy[bestI] = { ...bars[bestI], high: seedPeak };
  return copy;
}

/** DB에 남은 고점 초를 그 분봉에 붙인다. Polygon 초봉이 없을 때 재계산용. */
export function applySavedPeakAt(bars: WashoutBar[], peakAt: number): WashoutBar[] {
  if (!Number.isFinite(peakAt) || peakAt <= 0 || bars.length === 0) return bars;
  const minuteT = Math.floor(peakAt / MINUTE_MS) * MINUTE_MS;
  const i = bars.findIndex((bar) => bar.t === minuteT);
  if (i < 0) return bars;
  const copy = bars.slice();
  copy[i] = { ...bars[i], peakAt };
  return copy;
}

export function dumpGrid(grid: Map<number, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of grid) out[String(k)] = v;
  return out;
}

export function loadGrid(raw: Record<string, number> | null | undefined): Map<number, number> {
  const grid = new Map<number, number>();
  if (!raw || typeof raw !== "object") return grid;
  for (const [k, v] of Object.entries(raw)) {
    const key = Number(k);
    const val = Number(v);
    if (Number.isFinite(key) && Number.isFinite(val)) grid.set(key, val);
  }
  return grid;
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

function idleState(
  bar: WashoutBar,
  close: number,
  grid: Map<number, number>,
  prevClose: number,
  wasAboveGate: boolean,
  grantDay: string,
  carry: { elapsed: number; captureAt: number; untilMs: number }
): WashoutEngineState {
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
    peakAt: 0,
    captureAt: 0,
    sessionCaptureAt: 0,
    prevPrice: close,
    grid,
    prevClose,
    wasAboveGate,
    recaptureArmed: false,
    grantDay,
    captureNotionalUsd: 0,
    captureVolume: 0,
    captureVwap: 0,
    trackUntilMs: 0,
    carryElapsedMin: carry.elapsed,
    carryCaptureAt: carry.captureAt,
    carryUntilMs: carry.untilMs,
  };
}

function crossesSession(prevT: number, t: number): boolean {
  if (prevT < 0 || t <= prevT) return false;
  if ((t - prevT) / 60_000 > SESSION_GAP_MIN) return true;
  const a = sessionAtInstant(new Date(prevT));
  const b = sessionAtInstant(new Date(t));
  return a != null && b != null && a !== b;
}

/** 같은 ET 본장에서 분봉이 3분 넘게 비면 LULD·서킷 재개. */
export function isRthCircuitResume(prevT: number, t: number): boolean {
  if (prevT < 0 || t <= prevT) return false;
  if ((t - prevT) / 60_000 <= SESSION_GAP_MIN) return false;
  if (sessionAtInstant(new Date(prevT)) !== "regular") return false;
  if (sessionAtInstant(new Date(t)) !== "regular") return false;
  return usEtYmd(new Date(prevT)) === usEtYmd(new Date(t));
}

function nextState(prev: WashoutEngineState, bar: WashoutBar, opts?: WashoutScoreOpts): WashoutEngineState {
  void opts;
  const close = bar.price;
  const link = tapeLink(prev.t, bar.t);
  const open = bar.open ?? (link === "none" ? prev.prevPrice : close);
  const sessionJump = crossesSession(prev.t, bar.t) && link === "bridge";
  const candleHigh =
    link === "new-tape"
      ? (bar.high ?? Math.max(open, close))
      : sessionJump
        ? Math.max(open, close)
        : bar.high ?? Math.max(open, close);
  let {
    peakPrice,
    peakAt,
    captureAt,
    sessionCaptureAt = 0,
    score,
    tracking,
    grid,
    prevClose,
    sessionElapsedMin,
    sessionQuotaMin,
    wasAboveGate,
    recaptureArmed,
    grantDay,
    captureNotionalUsd = 0,
    captureVolume = 0,
    captureVwap = 0,
    carryElapsedMin = 0,
    carryCaptureAt = 0,
    carryUntilMs = 0,
    peakElapsedMin = 0,
  } = prev;

  if (link === "new-tape") {
    tracking = false;
    peakPrice = 0;
    peakAt = 0;
    captureAt = 0;
    sessionCaptureAt = 0;
    score = 0;
    grid = new Map();
    sessionElapsedMin = 0;
    sessionQuotaMin = 0;
    captureNotionalUsd = 0;
    captureVolume = 0;
    captureVwap = 0;
    wasAboveGate = false;
    recaptureArmed = false;
    grantDay = "";
    carryElapsedMin = 0;
    carryCaptureAt = 0;
    carryUntilMs = 0;
    peakElapsedMin = 0;
  } else if (link === "bridge") {
    const start = sessionStartMs(bar.t);
    if (tracking) {
      carryElapsedMin = Math.min(sessionElapsedMin, TAPE_DAY_SESSION_MIN);
      carryCaptureAt = captureAt;
      carryUntilMs = start != null ? start + WASHOUT_SESSION_CARRY_MIN * 60_000 : 0;
    } else {
      carryElapsedMin = 0;
      carryCaptureAt = 0;
      carryUntilMs = 0;
    }
    tracking = false;
    peakPrice = 0;
    peakAt = 0;
    captureAt = 0;
    sessionCaptureAt = 0;
    score = 0;
    grid = new Map();
    sessionElapsedMin = 0;
    sessionQuotaMin = 0;
    captureNotionalUsd = 0;
    captureVolume = 0;
    captureVwap = 0;
    wasAboveGate = false;
    recaptureArmed = false;
    grantDay = "";
    peakElapsedMin = 0;
  }

  const pc = bar.prevClose ?? prevClose;
  if (pc !== prevClose) {
    prevClose = pc;
    wasAboveGate = false;
  }
  const gateBar = sessionJump || link !== "none" ? { ...bar, high: candleHigh } : bar;
  const above = meetsWashoutCapture(gateBar, prevClose);
  const barDay = runnerTapeDate(new Date(bar.t));
  const carry = { elapsed: carryElapsedMin, captureAt: carryCaptureAt, untilMs: carryUntilMs };

  if (tracking && sessionElapsedMin >= sessionQuotaMin) {
    tracking = false;
    peakPrice = 0;
    peakAt = 0;
    captureAt = 0;
    sessionCaptureAt = 0;
    score = 0;
    grid = new Map();
    sessionElapsedMin = 0;
    sessionQuotaMin = 0;
    captureNotionalUsd = 0;
    captureVolume = 0;
    captureVwap = 0;
    wasAboveGate = above;
    recaptureArmed = false;
    carryElapsedMin = 0;
    carryCaptureAt = 0;
    carryUntilMs = 0;
  }
  if (!tracking && grantDay && grantDay !== barDay) grantDay = "";

  let peakBar = false;
  let startedThisBar = false;
  if (!tracking) {
    if (!above) return idleState(bar, close, grid, prevClose, false, grantDay, carry);
    if (wasAboveGate) return idleState(bar, close, grid, prevClose, true, grantDay, carry);
    tracking = true;
    grantDay = barDay;
    const bridged = carryUntilMs > 0 && bar.t < carryUntilMs && carryElapsedMin > 0 && carryCaptureAt > 0;
    captureAt = bridged ? carryCaptureAt : bar.t;
    sessionCaptureAt = bar.t;
    peakPrice = candleHigh;
    peakAt = bar.peakAt ?? bar.t;
    grid = new Map();
    score = 0;
    const step = trackElapsedStep(trackingOriginMs(peakAt), bar.t);
    sessionElapsedMin = Math.min(
      (bridged ? carryElapsedMin : 0) + step,
      TAPE_DAY_SESSION_MIN
    );
    sessionQuotaMin = TAPE_DAY_SESSION_MIN;
    captureNotionalUsd = barNotionalUsd(bar) ?? 0;
    captureVolume = bar.volume ?? 0;
    captureVwap = bar.vwap ?? 0;
    wasAboveGate = true;
    recaptureArmed = false;
    carryElapsedMin = 0;
    carryCaptureAt = 0;
    carryUntilMs = 0;
    peakBar = true;
    startedThisBar = true;
  } else {
    wasAboveGate = above;
  }

  if (candleHigh > peakPrice) {
    peakPrice = candleHigh;
    peakAt = bar.peakAt ?? bar.t;
    grid = new Map();
    score = 0;
    peakBar = true;
  }

  if (!peakBar && peakPrice > 0 && close >= peakPrice) {
    grid = new Map();
    score = 0;
  }

  const dumpOpen = isRthCircuitResume(prev.t, bar.t) ? prev.prevPrice : open;
  const toDd = drawdownPct(peakPrice, close);
  const fromDd = peakBar ? 0 : drawdownPct(peakPrice, dumpOpen);
  const barEnd = minuteBarEnd(bar.t);
  const dtMinutes = peakBar ? peakBarDtMinutes(bar.peakAt ?? bar.t, barEnd) : 1;
  const before = score;
  if (toDd > fromDd) {
    score = paintDown(grid, fromDd, toDd, dtMinutes);
  } else {
    score = lookupDd(grid, toDd);
  }

  if (!startedThisBar) {
    sessionElapsedMin = Math.min(sessionElapsedMin + trackElapsedStep(prev.t, bar.t), TAPE_DAY_SESSION_MIN);
  }
  if (peakBar) peakElapsedMin = sessionElapsedMin;
  const trackUntilMs = trackingEndsAt(bar.t, sessionElapsedMin, sessionQuotaMin);

  return {
    t: bar.t,
    price: close,
    peakPrice,
    peakAt,
    captureAt,
    sessionCaptureAt,
    ddPct: toDd,
    minuteChange: toDd - fromDd,
    minuteScore: score - before,
    score,
    tracking: true,
    sessionElapsedMin,
    sessionQuotaMin,
    peakElapsedMin,
    captureNotionalUsd,
    captureVolume,
    captureVwap,
    trackUntilMs,
    prevPrice: close,
    grid,
    prevClose,
    wasAboveGate,
    recaptureArmed,
    grantDay,
    carryElapsedMin: 0,
    carryCaptureAt: 0,
    carryUntilMs: 0,
  };
}

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

function pointOf(state: WashoutEngineState): WashoutPoint {
  return {
    t: state.t,
    price: state.price,
    peakPrice: state.peakPrice,
    peakAt: state.peakAt,
    captureAt: state.captureAt,
    sessionCaptureAt: state.sessionCaptureAt,
    ddPct: state.ddPct,
    minuteChange: state.minuteChange,
    minuteScore: state.minuteScore,
    score: state.score,
    tracking: state.tracking,
    sessionElapsedMin: state.sessionElapsedMin,
    sessionQuotaMin: state.sessionQuotaMin,
    peakElapsedMin: state.peakElapsedMin,
    captureNotionalUsd: state.captureNotionalUsd,
    captureVolume: state.captureVolume,
    captureVwap: state.captureVwap,
    trackUntilMs: state.trackUntilMs,
  };
}

export function washoutScoreRun(
  bars: WashoutBar[],
  prevClose: number,
  opts?: WashoutScoreOpts
): { points: WashoutPoint[]; state: WashoutEngineState } {
  const seeded = applySavedPeakAt(applySeedPeak(bars, opts?.seedPeak ?? 0), opts?.savedPeakAt ?? 0);
  let state: WashoutEngineState = {
    t: -1,
    price: prevClose,
    peakPrice: 0,
    peakAt: 0,
    captureAt: 0,
    sessionCaptureAt: 0,
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
    grantDay: opts?.grantedOn ?? "",
    captureNotionalUsd: 0,
    captureVolume: 0,
    captureVwap: 0,
    trackUntilMs: 0,
    carryElapsedMin: 0,
    carryCaptureAt: 0,
    carryUntilMs: 0,
  };
  const points: WashoutPoint[] = [];
  for (const bar of seeded) {
    state = nextState(state, bar, opts);
    points.push(pointOf(state));
  }
  return { points, state };
}

export function washoutScoreSeries(
  bars: WashoutBar[],
  prevClose: number,
  opts?: WashoutScoreOpts
): WashoutPoint[] {
  return washoutScoreRun(bars, prevClose, opts).points;
}

export function lastWashoutScore(
  bars: WashoutBar[],
  prevClose: number,
  opts?: WashoutScoreOpts
): number {
  const series = washoutScoreSeries(bars, prevClose, opts);
  return series.length ? series[series.length - 1].score : 0;
}

export const WASHOUT_INDEX_CAP_S = 5600;
export const WASHOUT_INDEX_CAP_P = 8;

/** 포착→고점 세션시간. 1h 미만 ×1.5, 1–4h 로그 1.5→1, 4–6h 로그 1→0.8, 이후 ×0.8. */
export function intervalGapWeight(sessionMinutes: number): number {
  const h = Math.max(0, sessionMinutes) / 60;
  if (h < 1) return 1.5;
  if (h <= 4) return 1.5 - 0.5 * (Math.log(h / 1) / Math.log(4 / 1));
  if (h <= 6) return 1 - 0.2 * (Math.log(h / 4) / Math.log(6 / 4));
  return 0.8;
}

export function intervalGapWeightFromTimes(captureAt?: number, peakAt?: number): number {
  if (!(captureAt != null && captureAt > 0 && peakAt != null && peakAt > 0)) return 1;
  return intervalGapWeight(sessionMinutesBetween(captureAt, peakAt));
}

export function washoutScoreForIndex(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  const u = score / WASHOUT_INDEX_CAP_S;
  return WASHOUT_INDEX_CAP_S * (u / (1 + u ** WASHOUT_INDEX_CAP_P) ** (1 / WASHOUT_INDEX_CAP_P));
}

/** 개별 점수 → 간격필터 → 상한. 시각이 없으면 간격은 1(미적용). */
export function washoutScoreForIndexName(entry: WashoutIndexName): number {
  const gap =
    entry.peakElapsedMin != null && entry.peakElapsedMin > 0
      ? intervalGapWeight(entry.peakElapsedMin)
      : intervalGapWeightFromTimes(entry.captureAt, entry.peakAt);
  return washoutScoreForIndex(entry.score * gap);
}

export function washoutIndexAverage(entries: Array<number | WashoutIndexName>): number {
  if (!entries.length) return 0;
  let sum = 0;
  for (const entry of entries) {
    sum += typeof entry === "number" ? washoutScoreForIndex(entry) : washoutScoreForIndexName(entry);
  }
  return sum / entries.length;
}

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
    const scores: WashoutIndexName[] = [];
    let t = k * MINUTE_MS;
    for (const point of last) {
      if (washoutPointInSessionIndex(point, t)) {
        scores.push({
          score: point.score,
          captureAt: point.captureAt,
          peakAt: point.peakAt,
          peakElapsedMin: point.peakElapsedMin,
        });
        if (point.t > t) t = point.t;
      }
    }
    out.push({ t, score: washoutIndexAverage(scores) });
  }
  return out;
}

export type WashoutIndexMember = {
  ticker: string;
  /** 개별 점수 × 간격필터 → 상한. 평균 전. */
  score: number;
};

export type WashoutNamedSeries = {
  ticker: string;
  series: WashoutPoint[];
};

export function washoutSeriesForIndex(points: WashoutPoint[]): WashoutPoint[] {
  const out: WashoutPoint[] = [];
  for (const point of points) {
    if (point.tracking) out.push(point);
    else if (out.length && out[out.length - 1].tracking) out.push(point);
  }
  return out;
}

export function washoutIndexPathDetailed(named: WashoutNamedSeries[]): Array<{
  t: number;
  score: number;
  members: WashoutIndexMember[];
}> {
  const contribCache = new Map<string, number>();
  function contrib(point: WashoutPoint): number {
    const key = `${point.score}\t${point.captureAt}\t${point.peakAt}\t${point.peakElapsedMin ?? ""}`;
    const hit = contribCache.get(key);
    if (hit != null) return hit;
    const v = washoutScoreForIndexName({
      score: point.score,
      captureAt: point.captureAt,
      peakAt: point.peakAt,
      peakElapsedMin: point.peakElapsedMin,
    });
    contribCache.set(key, v);
    return v;
  }

  const keys = new Set<number>();
  for (const row of named) {
    for (const point of row.series) keys.add(Math.floor(point.t / MINUTE_MS));
  }
  const ordered = [...keys].sort((a, b) => a - b);
  const cursors = named.map(() => 0);
  const last: Array<WashoutPoint | null> = named.map(() => null);
  const out: Array<{ t: number; score: number; members: WashoutIndexMember[] }> = [];
  for (const k of ordered) {
    for (let i = 0; i < named.length; i++) {
      const series = named[i].series;
      while (cursors[i] < series.length && Math.floor(series[cursors[i]].t / MINUTE_MS) <= k) {
        last[i] = series[cursors[i]];
        cursors[i]++;
      }
    }
    const members: WashoutIndexMember[] = [];
    let t = k * MINUTE_MS;
    for (let i = 0; i < named.length; i++) {
      const point = last[i];
      if (!washoutPointInSessionIndex(point, t)) continue;
      if (Math.floor(point.t / MINUTE_MS) > k) continue;
      members.push({ ticker: named[i].ticker, score: contrib(point) });
      if (point.t > t) t = point.t;
    }
    members.sort((a, b) => b.score - a.score);
    const score = members.length
      ? members.reduce((sum, row) => sum + row.score, 0) / members.length
      : 0;
    out.push({ t, score, members });
  }
  return out;
}
