import { RECLAIM_ODDS, RECLAIM_PEAK_EDGES } from "./reclaim-odds-table";

const EDGES = RECLAIM_PEAK_EDGES;

export type ReclaimQuote = {
  reclaimPct: number;
  nextPct: number;
  nextEdge: number | null;
};

export function peakZoneLo(peakPct: number): number | null {
  if (!(peakPct >= 30)) return null;
  for (let i = 0; i < EDGES.length - 1; i++) {
    if (peakPct < EDGES[i + 1]) return EDGES[i];
  }
  return peakPct >= 1000 ? 1000 : null;
}

export function nextPeakEdge(zoneLo: number): number | null {
  const i = EDGES.indexOf(zoneLo as (typeof EDGES)[number]);
  if (i < 0 || i >= EDGES.length - 1) return null;
  return EDGES[i + 1];
}

function ddFloorIndex(ddPct: number): number {
  if (ddPct >= 100) return 19;
  const lo = Math.floor(Math.max(0, ddPct) / 5) * 5;
  return Math.min(19, lo / 5);
}

/** 0%는 두지 않는다. 0이면 0.1%로 보여 준다. */
export function showOddsPct(pct: number): number {
  if (!Number.isFinite(pct) || pct <= 0) return 0.1;
  if (pct >= 100) return 100;
  return pct;
}

/** 최저점(x=0)의 확률에서 고점(x=100)의 100%로 가는 지수함수. */
export function liftProbability(basePct: number, x: number): number {
  const p0 = basePct > 0 ? basePct : 0.1;
  const pos = Math.min(100, Math.max(0, x));
  const y = p0 * Math.pow(100 / p0, pos / 100);
  return showOddsPct(Math.min(100, y));
}

/** 최저점 0, 고점 100. 고점과 최저점이 같으면 이미 고점이다. */
export function recoveryX(peak: number, low: number, price: number): number {
  if (!(peak > low)) return 100;
  const x = ((price - low) / (peak - low)) * 100;
  if (!Number.isFinite(x)) return 100;
  return Math.min(100, Math.max(0, x));
}

export function lowAfterPeak(
  bars: Array<{ t: number; low?: number; price: number }>,
  peakAt: number,
  peakPrice: number,
  lastPrice: number
): number {
  let low = peakPrice > 0 ? peakPrice : lastPrice;
  for (const bar of bars) {
    if (!(bar.t >= 0)) continue;
    if (peakAt > 0 && bar.t <= peakAt) continue;
    const px = bar.low ?? bar.price;
    if (px > 0 && px < low) low = px;
  }
  if (lastPrice > 0 && lastPrice < low) low = lastPrice;
  return low > 0 ? low : lastPrice;
}

function basePct(zoneLo: number, lowDdPct: number): number {
  const row = RECLAIM_ODDS[zoneLo];
  if (!row) return 0;
  const i = ddFloorIndex(lowDdPct);
  const s = row.s[i] ?? 0;
  const f = row.f[i] ?? 0;
  const d = s + f;
  if (!d) return 0;
  return (s / d) * 100;
}

function higherShare(zoneLo: number): number {
  let current = 0;
  let higher = 0;
  for (const edge of EDGES) {
    const n = RECLAIM_ODDS[edge]?.f[0] ?? 0;
    if (edge === zoneLo) current += n;
    else if (edge > zoneLo) higher += n;
  }
  const d = current + higher;
  if (!d) return 0;
  return higher / d;
}

export function quoteReclaim(input: {
  prevClose: number;
  peak: number;
  low: number;
  price: number;
}): ReclaimQuote | null {
  const { prevClose, peak, low, price } = input;
  if (!(prevClose > 0) || !(peak > 0) || !(price > 0)) return null;
  const peakPct = (peak / prevClose - 1) * 100;
  const zone = peakZoneLo(peakPct);
  if (zone == null) return null;
  const lowPx = Math.min(low > 0 ? low : peak, peak, price);
  const highPx = Math.max(peak, price);
  const lowDd = highPx > 0 ? ((highPx - lowPx) / highPx) * 100 : 0;
  const x = recoveryX(highPx, lowPx, Math.min(price, highPx));
  const reclaimPct = liftProbability(basePct(zone, lowDd), x);
  const nextEdge = nextPeakEdge(zone);
  const nextPct = showOddsPct(reclaimPct * higherShare(zone));
  return { reclaimPct, nextPct, nextEdge };
}
