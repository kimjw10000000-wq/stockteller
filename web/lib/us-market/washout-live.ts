import {
  dumpGrid,
  washoutIndexAverage,
  washoutIndexPath,
  washoutReactionIndexPath,
  washoutScoreForIndexName,
  trackingOriginMs,
  specialTickersAfterRth,
  WASHOUT_REACTION_MS,
  WASHOUT_TRACK_PCT,
  type WashoutBar,
  type WashoutPoint,
} from "./washout-score";
import {
  sessionSlotX,
  tapeSessionAtMs,
  washoutCompareAt,
  washoutComparePaths,
  type WashoutCompare,
} from "./washout-compare";
import { polygonAdvancedKeyOrNull, polygonGetWithKey, polygonStarterKeyOrNull } from "./polygon-keys";
import { fetchMinuteAggs, polygonTimeMs, scoreWithPeakSeconds } from "./washout-polygon";
import {
  activeTapeSession,
  boardTapeYmd,
  etWallMs,
  isInTapeDay,
  isUsWeekday,
  previousEtWeekday,
  runnerTapeDate,
  sessionAtInstant,
  sessionBounds,
  tapeDatesBack,
  usEtYmd,
  type UsTradingSession,
} from "./us-session";
import {
  loadSamplesForTapeDates,
  loadSamplesSince,
  loadTapeHighs,
  loadTrackedBoard,
  loadTrackGrants,
  loadTrackedOrigins,
  loadTrackedPeaks,
  loadTrackedTickers,
  persistSamples,
  persistTapeHighs,
  persistTrackGrants,
  persistTrackedBoard,
} from "./washout-samples";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchSecExchangeTickers, normalizeExchange } from "@/lib/companies/sec-exchange-tickers";
import { isJuniorShareListing } from "@/lib/companies/share-class";
import { canonicalWashoutTicker, loadTickerChangeAliases } from "@/lib/companies/listing-admin";

export type WashoutBoardRow = {
  ticker: string;
  score: number;
  ddPct: number;
  tracking: boolean;
  sessionElapsedMin: number;
  sessionQuotaMin: number;
  peakPrice?: number;
  peakAt?: number;
  captureAt?: number;
  sessionCaptureAt?: number;
  peakElapsedMin?: number;
  trackFrom?: number;
  lastPrice?: number;
  lastBarT?: number;
  prevClose?: number;
  grid?: Record<string, number>;
};

type SnapshotRow = {
  ticker?: string;
  todaysChangePerc?: number;
  day?: { o?: number; h?: number; c?: number; v?: number };
  prevDay?: { c?: number };
  min?: { c?: number; h?: number; t?: number };
  lastTrade?: { p?: number; t?: number };
  lastQuote?: { p?: number };
};

const CACHE_MS = 0;
const HIST_CACHE_MS = 8_000;
const LISTED_MS = 10 * 60_000;
const MAX_TICKERS = 120;
/** Advanced 키는 실시간 전용. 백필은 Starter. 스냅샷+분봉이 같은 키를 나누므로 종목 병렬은 6. */
const CONCURRENCY = 6;
const tracked = new Set<string>();
let tapeHighCache: { tapeYmd: string; high: Map<string, number> } | null = null;
let listedCache: { at: number; set: Set<string> } | null = null;
let aliasCache: { at: number; map: Map<string, string> } | null = null;

function listingKey(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\./g, "-");
}

async function loadWashoutAliases(): Promise<Map<string, string>> {
  const now = Date.now();
  if (aliasCache && now - aliasCache.at < LISTED_MS) return aliasCache.map;
  try {
    const map = await loadTickerChangeAliases(createAdminClient());
    aliasCache = { at: now, map };
    return map;
  } catch {
    return aliasCache?.map ?? new Map();
  }
}

async function loadListedTickers(): Promise<Set<string>> {
  const now = Date.now();
  if (listedCache && now - listedCache.at < LISTED_MS) return listedCache.set;
  const admin = createAdminClient();
  const rows: Array<{ ticker: string; cik: string }> = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await admin
      .from("us_listed_companies")
      .select("ticker,exchange,cik")
      .eq("is_active", true)
      .range(from, from + page - 1);
    if (error) {
      if (listedCache) return listedCache.set;
      throw error;
    }
    const chunk = data ?? [];
    for (const row of chunk) {
      const ticker = listingKey(String(row.ticker ?? ""));
      if (!ticker) continue;
      if (normalizeExchange(String(row.exchange ?? "")) === "OTC") continue;
      rows.push({ ticker, cik: String(row.cik ?? "").replace(/\D/g, "").padStart(10, "0") });
    }
    if (chunk.length < page) break;
  }
  const byCik = new Map<string, string[]>();
  const seen = new Set<string>();
  const merged: Array<{ ticker: string; cik: string }> = [];
  const add = (ticker: string, cik: string) => {
    const t = listingKey(ticker);
    if (!t || seen.has(t)) return;
    seen.add(t);
    merged.push({ ticker: t, cik });
    const list = byCik.get(cik) ?? [];
    list.push(t);
    byCik.set(cik, list);
  };
  for (const row of rows) add(row.ticker, row.cik);
  try {
    const sec = await fetchSecExchangeTickers({ listedOnly: true });
    for (const row of sec) add(row.ticker, row.cik);
  } catch {
    /* DB만으로도 동작 */
  }
  const set = new Set<string>();
  for (const row of merged) {
    if (isJuniorShareListing(row.ticker, byCik.get(row.cik) ?? [row.ticker])) continue;
    set.add(row.ticker);
  }
  listedCache = { at: now, set };
  return set;
}

export async function loadWashoutListedTickers(): Promise<Set<string>> {
  return loadListedTickers();
}

type LiveBundle = {
  index: number;
  series: Array<{ t: number; v: number }>;
  tapeYmd: string;
  items: WashoutBoardRow[];
};

let inflight: Promise<LiveBundle> | null = null;

export type WashoutRange = "1d" | "1w" | "1m" | "3m";

export type WashoutChartPoint = {
  t: number;
  v: number;
  x: number;
};

export type WashoutBoardPayload = {
  index: number;
  series: WashoutChartPoint[];
  items: WashoutBoardRow[];
  range: WashoutRange;
  session: UsTradingSession;
  axisStart: number;
  axisEnd: number;
  sessionDate: string;
  fetchedAt: string;
  servedFromCache: boolean;
  compare?: WashoutCompare;
  /** 현재반응 설거지 지수. 추적 시작 후 90분 안의 종목만 평균. */
  reaction?: {
    index: number;
    series: WashoutChartPoint[];
    compare?: WashoutCompare;
  };
  error?: string;
};

function asDump(v: number): number {
  if (!Number.isFinite(v) || v === 0) return 0;
  return -Math.abs(v);
}

function gatePct(high: number, prevClose: number): number {
  if (prevClose <= 0) return 0;
  return (high / prevClose - 1) * 100;
}

function livePrint(raw: SnapshotRow): { t: number; price: number; high: number } | null {
  const price = raw.lastTrade?.p;
  const t = polygonTimeMs(raw.lastTrade?.t);
  if (price == null || !Number.isFinite(price) || t == null) return null;
  return { t, price, high: price };
}

function minuteStart(ms: number): number {
  return Math.floor(ms / 60_000) * 60_000;
}

function mergeLiveBar(
  bars: WashoutBar[],
  live: { t: number; price: number; high: number } | null,
  prevClose: number,
  startMs: number
): WashoutBar[] {
  if (!live) return bars;
  if (live.t < startMs || !isSessionBar(live.t)) return bars;
  const minuteT = minuteStart(live.t);
  const high = Math.max(live.high, live.price);
  const peakAt = live.price >= high ? live.t : minuteT;
  const bar: WashoutBar = {
    t: minuteT,
    price: live.price,
    open: live.price,
    high,
    prevClose,
    peakAt,
    closeAt: live.t,
  };
  if (!bars.length) return [bar];
  const last = bars[bars.length - 1];
  const lastMin = Math.floor(last.t / 60_000);
  const liveMin = Math.floor(live.t / 60_000);
  if (liveMin === lastMin) {
    const prevHigh = last.high ?? last.price;
    last.t = minuteStart(last.t);
    last.price = live.price;
    last.high = Math.max(prevHigh, live.high, live.price);
    last.prevClose = prevClose;
    last.closeAt = live.t;
    if (last.high > prevHigh) {
      last.peakAt = live.price >= last.high ? live.t : last.t;
    }
    return bars;
  }
  if (live.t > last.t) return [...bars, bar];
  return bars;
}

function maxNum(...vals: Array<number | undefined>): number | null {
  let best = -Infinity;
  for (const n of vals) {
    if (n != null && Number.isFinite(n)) best = Math.max(best, n);
  }
  return Number.isFinite(best) && best !== -Infinity ? best : null;
}

function rememberTapeHigh(tapeYmd: string, ticker: string, print: number | null): number | null {
  if (print == null || !Number.isFinite(print)) return tapeHighCache?.high.get(ticker) ?? null;
  if (!tapeHighCache || tapeHighCache.tapeYmd !== tapeYmd) {
    tapeHighCache = { tapeYmd, high: new Map() };
  }
  const prev = tapeHighCache.high.get(ticker);
  const high = prev != null && print < prev ? prev : print;
  tapeHighCache.high.set(ticker, high);
  return high;
}

function snapshotMinuteHigh(raw: SnapshotRow): number | null {
  return maxNum(raw.min?.h, raw.min?.c);
}

function isCandidate(
  row: {
    ticker: string;
    prevClose: number;
    high: number;
    changePerc: number | null;
  },
  granted: Set<string>
): boolean {
  if (tracked.has(row.ticker)) return true;
  if (granted.has(row.ticker)) return false;
  return gatePct(row.high, row.prevClose) >= WASHOUT_TRACK_PCT;
}

async function loadSnapshotRows(key: string): Promise<SnapshotRow[]> {
  const by = new Map<string, SnapshotRow>();
  const add = (rows?: SnapshotRow[]) => {
    for (const row of rows ?? []) {
      const ticker = (row.ticker ?? "").trim().toUpperCase();
      if (ticker) by.set(ticker, { ...row, ticker });
    }
  };
  try {
    const all = (await polygonGetWithKey(
      "/v2/snapshot/locale/us/markets/stocks/tickers?include_otc=false",
      key
    )) as { tickers?: SnapshotRow[]; next_url?: string };
    add(all.tickers);
    let next = all.next_url;
    for (let page = 0; next && page < 12; page++) {
      try {
        const url = new URL(next);
        const payload = (await polygonGetWithKey(`${url.pathname}${url.search}`, key)) as {
          tickers?: SnapshotRow[];
          next_url?: string;
        };
        add(payload.tickers);
        next = payload.next_url;
      } catch {
        break;
      }
    }
  } catch {
    /* gainers still merge below */
  }
  try {
    const top = (await polygonGetWithKey(
      "/v2/snapshot/locale/us/markets/stocks/gainers?include_otc=false",
      key
    )) as { tickers?: SnapshotRow[] };
    add(top.tickers);
  } catch {
    /* keep whatever snapshot returned */
  }
  return [...by.values()];
}

async function fetchLastTrade(
  ticker: string,
  key: string
): Promise<{ p: number; t: number } | null> {
  try {
    const payload = (await polygonGetWithKey(
      `/v2/last/trade/${encodeURIComponent(ticker)}`,
      key
    )) as {
      results?: { p?: number; t?: number; sip_timestamp?: number };
    };
    const row = payload.results;
    const p = row?.p;
    const t = polygonTimeMs(row?.t) ?? polygonTimeMs(row?.sip_timestamp);
    if (p == null || !Number.isFinite(p) || t == null) return null;
    return { p, t };
  } catch {
    return null;
  }
}

async function fetchMinuteBars(
  ticker: string,
  from: string,
  to: string,
  key: string
): Promise<WashoutBar[]> {
  return fetchMinuteAggs(ticker, from, to, key);
}

function isSessionBar(t: number): boolean {
  if (!isUsWeekday(new Date(t))) return false;
  return sessionAtInstant(new Date(t)) != null;
}

function clipSessionBars(bars: WashoutBar[]): WashoutBar[] {
  return bars.filter((bar) => isSessionBar(bar.t));
}

function rangeDays(range: WashoutRange): number {
  if (range === "1d") return 1;
  if (range === "1w") return 5;
  if (range === "1m") return 30;
  return 90;
}

function downsample(
  points: Array<{ t: number; v: number; tape_date?: string }>,
  range: WashoutRange,
  days: string[],
  session: UsTradingSession
): Array<{ t: number; v: number; tape?: string }> {
  if (range === "1d" || points.length === 0) return points;
  const ordered = [...points].sort((a, b) => a.t - b.t);
  const by = new Map<string, { t: number; v: number; tape: string }>();
  for (const point of ordered) {
    const tape =
      (point.tape_date ?? "").slice(0, 10) || runnerTapeDate(new Date(point.t));
    const i = days.indexOf(tape);
    if (i < 0 || tapeSessionAtMs(point.t, tape) !== session) continue;
    const { start } = sessionBounds(tape, session);
    const key =
      range === "1w" ? `${tape}:${Math.floor((point.t - start) / 60_000 / 10)}` : tape;
    by.set(key, { t: point.t, v: point.v, tape });
  }
  return [...by.values()].sort((a, b) => a.t - b.t);
}

function xOnAxis(
  t: number,
  days: string[],
  range: WashoutRange,
  session: UsTradingSession,
  tapeHint?: string
): number {
  const tape = (tapeHint ?? "").slice(0, 10) || runnerTapeDate(new Date(t));
  return sessionSlotX(
    t,
    tape,
    days.indexOf(tape),
    days.length,
    session,
    range === "1m" || range === "3m"
  );
}

function withX(
  points: Array<{ t: number; v: number; tape?: string; tape_date?: string }>,
  days: string[],
  range: WashoutRange,
  session: UsTradingSession
): WashoutChartPoint[] {
  const out: WashoutChartPoint[] = [];
  for (const point of points) {
    const x = xOnAxis(point.t, days, range, session, point.tape ?? point.tape_date);
    if (x < 0 || x > 1) continue;
    out.push({ t: point.t, v: point.v, x });
  }
  return out;
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

function rank(row: { high: number; prevClose: number; changePerc: number | null }): number {
  return Math.max(gatePct(row.high, row.prevClose), row.changePerc ?? 0);
}

function barPrevClose(
  t: number,
  nowYmd: string,
  priorClose: number,
  todayClose: number | null
): number {
  const todayRthEnd = etWallMs(nowYmd, 16, 0);
  if (todayClose != null && todayClose > 0 && t >= todayRthEnd) return todayClose;
  return priorClose;
}

function refClose(raw: SnapshotRow, now: Date): number | null {
  const dayC = raw.day?.c;
  if (
    sessionAtInstant(now) === "afterhours" &&
    dayC != null &&
    Number.isFinite(dayC) &&
    dayC > 0
  ) {
    return dayC;
  }
  const close = raw.prevDay?.c;
  return close != null && Number.isFinite(close) && close > 0 ? close : null;
}

function nameInThisSession(sessionCaptureAt: number | undefined, now: number): boolean {
  const started = sessionCaptureAt || 0;
  if (!(started > 0)) return true;
  if (runnerTapeDate(new Date(started)) !== runnerTapeDate(new Date(now))) return false;
  return sessionAtInstant(new Date(started)) === sessionAtInstant(new Date(now));
}

function memberGrid(hit: WashoutBoardRow | undefined, now: number): Record<string, number | string> | undefined {
  if (!hit) return undefined;
  const base: Record<string, number | string> = { ...(hit.grid ?? {}) };
  const session = sessionAtInstant(new Date(now));
  const captureAt = hit.captureAt ?? 0;
  const inIndex = nameInThisSession(hit.sessionCaptureAt, now);
  const age = captureAt > 0 ? now - captureAt : Number.POSITIVE_INFINITY;
  if (captureAt > 0) base.captureAt = captureAt;
  if (hit.peakElapsedMin && hit.peakElapsedMin > 0) base.peakElapsedMin = hit.peakElapsedMin;
  if (hit.peakAt && hit.peakAt > 0) base.peakAt = hit.peakAt;
  base.indexScore = washoutScoreForIndexName({
    score: hit.score,
    captureAt: hit.captureAt,
    peakAt: hit.peakAt,
    peakElapsedMin: hit.peakElapsedMin,
  });
  base.inIndex = inIndex ? 1 : 0;
  base.inReaction = inIndex && age >= 0 && age <= WASHOUT_REACTION_MS ? 1 : 0;
  if (session) base.session = session;
  return base;
}

function stitchCarry(
  points: Array<{ t: number; v: number; tape_date?: string }>,
  axisStart: number,
  tapeYmd: string
): Array<{ t: number; v: number; tape_date?: string }> {
  const prev = points.filter((p) => p.t < axisStart).sort((a, b) => a.t - b.t).at(-1);
  const tapePts = points.filter((p) => p.t >= axisStart).sort((a, b) => a.t - b.t);
  if (!prev || !Number.isFinite(prev.v) || prev.v <= 0) return tapePts;
  const out: Array<{ t: number; v: number; tape_date?: string }> = [];
  let replaced = false;
  for (const point of tapePts) {
    if (!replaced && point.v === 0) {
      out.push({ ...point, v: prev.v, tape_date: tapeYmd });
      continue;
    }
    replaced = true;
    out.push(point);
  }
  if (out.length === 0 || out[0].t > axisStart + 60_000) {
    out.unshift({ t: axisStart, v: prev.v, tape_date: tapeYmd });
  }
  return out;
}

export type CaptureWashoutOpts = {
  persistAll?: boolean;
  persistFromMs?: number;
};

async function computeLive(now = new Date(), opts?: CaptureWashoutOpts): Promise<LiveBundle> {
  const tapeYmd = runnerTapeDate(now);
  const empty: LiveBundle = { index: 0, series: [], tapeYmd, items: [] };
  const key = polygonAdvancedKeyOrNull() || polygonStarterKeyOrNull();
  if (!key) return empty;
  const nowYmd = usEtYmd(now);
  const from = previousEtWeekday(nowYmd);
  const startMs = etWallMs(from, 4, 0);
  const to = nowYmd;
  for (const ticker of await loadTrackedTickers()) tracked.add(ticker);
  const savedHighs = await loadTapeHighs(tapeYmd);
  if (!tapeHighCache || tapeHighCache.tapeYmd !== tapeYmd) {
    tapeHighCache = { tapeYmd, high: new Map() };
  }
  for (const [ticker, high] of savedHighs) rememberTapeHigh(tapeYmd, ticker, high);
  const savedPeaks = await loadTrackedPeaks();
  const savedOrigins = await loadTrackedOrigins();
  const trackGrants = await loadTrackGrants(tapeYmd);
  for (const [ticker, peak] of savedPeaks) rememberTapeHigh(tapeYmd, ticker, peak.price);
  const wasTracked = new Set(tracked);
  const rows = await loadSnapshotRows(key);
  const listed = await loadListedTickers();
  const aliases = await loadWashoutAliases();
  for (const ticker of [...tracked]) {
    const canon = canonicalWashoutTicker(ticker, aliases);
    if (!listed.has(canon)) tracked.delete(ticker);
    else if (canon !== listingKey(ticker)) {
      tracked.delete(ticker);
      tracked.add(canon);
    }
  }
  const mappedRaw = rows
    .map((raw) => {
      const quoteTicker = listingKey(raw.ticker ?? "");
      const ticker = canonicalWashoutTicker(quoteTicker, aliases);
      if (!ticker || !listed.has(ticker)) return null;
      const priorClose = raw.prevDay?.c;
      const todayClose = raw.day?.c ?? null;
      const prevClose = refClose(raw, now);
      const minuteHigh = snapshotMinuteHigh(raw);
      if (minuteHigh != null) rememberTapeHigh(tapeYmd, ticker, minuteHigh);
      if (
        !ticker ||
        prevClose == null ||
        minuteHigh == null ||
        priorClose == null ||
        !Number.isFinite(priorClose) ||
        priorClose <= 0
      ) {
        return null;
      }
      const changePerc =
        raw.todaysChangePerc != null && Number.isFinite(raw.todaysChangePerc)
          ? raw.todaysChangePerc
          : null;
      return {
        ticker,
        quoteTicker,
        prevClose,
        priorClose,
        todayClose:
          todayClose != null && Number.isFinite(todayClose) && todayClose > 0 ? todayClose : null,
        high: minuteHigh,
        changePerc,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  const mappedBy = new Map<string, (typeof mappedRaw)[number]>();
  for (const row of mappedRaw) {
    const prevRow = mappedBy.get(row.ticker);
    if (!prevRow || rank(row) > rank(prevRow)) mappedBy.set(row.ticker, row);
  }
  for (const ticker of tracked) {
    if (mappedBy.has(ticker)) continue;
    const raw = rows.find((row) => canonicalWashoutTicker(listingKey(row.ticker ?? ""), aliases) === ticker);
    const prevClose = raw ? refClose(raw, now) : null;
    const priorClose = raw?.prevDay?.c;
    const todayClose = raw?.day?.c ?? null;
    const high = tapeHighCache?.high.get(ticker) ?? 0;
    if (prevClose == null || prevClose <= 0) continue;
    if (priorClose == null || !Number.isFinite(priorClose) || priorClose <= 0) continue;
    mappedBy.set(ticker, {
      ticker,
      quoteTicker: listingKey(raw?.ticker ?? ticker),
      prevClose,
      priorClose,
      todayClose:
        todayClose != null && Number.isFinite(todayClose) && todayClose > 0 ? todayClose : null,
      high,
      changePerc: raw?.todaysChangePerc ?? null,
    });
  }
  const mapped = [...mappedBy.values()];
  const specialNow = specialTickersAfterRth(
    mapped.map((row) => ({
      ticker: row.ticker,
      high: row.high,
      close: row.todayClose ?? row.high,
      prevClose: row.priorClose,
    }))
  );
  const held = mapped.filter((row) => tracked.has(row.ticker));
  const fresh = mapped.filter((row) => !tracked.has(row.ticker) && isCandidate(row, trackGrants));
  fresh.sort((a, b) => rank(b) - rank(a));
  const picked: typeof mapped = [];
  const seenPick = new Set<string>();
  for (const row of [...held, ...mapped.filter((r) => specialNow.has(r.ticker)), ...fresh]) {
    if (seenPick.has(row.ticker)) continue;
    seenPick.add(row.ticker);
    picked.push(row);
    if (picked.length >= MAX_TICKERS) break;
  }

  const snapBy = new Map<string, SnapshotRow>();
  for (const row of rows) {
    const ticker = listingKey(row.ticker ?? "");
    if (ticker) snapBy.set(ticker, row);
  }

  const seriesList: WashoutPoint[][] = [];
  const failed = new Set<string>();
  const scored = await mapPool(picked, CONCURRENCY, async (row) => {
    try {
      const { ticker, quoteTicker } = row;
      const [rawBars, lastTrade] = await Promise.all([
        fetchMinuteBars(quoteTicker, from, to, key).then(async (bars) =>
          bars.length || quoteTicker === ticker ? bars : fetchMinuteBars(ticker, from, to, key)
        ),
        fetchLastTrade(quoteTicker, key).then(async (hit) =>
          hit || quoteTicker === ticker ? hit : fetchLastTrade(ticker, key)
        ),
      ]);
      let bars = clipSessionBars(rawBars).filter((bar) => bar.t >= startMs);
      for (const bar of bars) {
        bar.prevClose = barPrevClose(bar.t, nowYmd, row.priorClose, row.todayClose);
        rememberTapeHigh(tapeYmd, ticker, bar.high ?? bar.price);
      }
      const snap = snapBy.get(quoteTicker) ?? snapBy.get(ticker);
      const fromSnap = snap ? livePrint(snap) : null;
      const live = lastTrade
        ? {
            t: lastTrade.t,
            price: lastTrade.p,
            high: Math.max(lastTrade.p, snap?.min?.h ?? lastTrade.p),
          }
        : fromSnap;
      const livePc = live ? barPrevClose(live.t, nowYmd, row.priorClose, row.todayClose) : row.prevClose;
      bars = mergeLiveBar(bars, live, livePc, startMs);
      const origin = savedOrigins.get(ticker);
      const clipFrom =
        origin != null && origin > 0
          ? Math.floor(origin / 60_000) * 60_000
          : wasTracked.has(ticker)
            ? startMs
            : minuteStart(now.getTime()) - 60_000;
      bars = bars.filter((bar) => bar.t >= clipFrom);
      const firstPc = bars[0]?.prevClose ?? row.prevClose;
      const out = await scoreWithPeakSeconds(bars, firstPc, row.ticker, key, {
        seedPeak: savedPeaks.get(ticker)?.price ?? 0,
        savedPeakAt: savedPeaks.get(ticker)?.at ?? 0,
        specialAhYmds: specialNow.has(ticker) ? [nowYmd] : undefined,
      });
      const last = out.series.length ? out.series[out.series.length - 1] : null;
      if (!last?.tracking) return null;
      const firstTrack = out.series.find((point) => point.tracking);
      seriesList.push(out.series);
      return {
        ticker: row.ticker,
        score: last.score,
        ddPct: last.ddPct,
        tracking: last.tracking,
        sessionElapsedMin: last.sessionElapsedMin,
        sessionQuotaMin: last.sessionQuotaMin,
        peakPrice: out.state.peakPrice,
        peakAt: out.state.peakAt,
        captureAt: last.captureAt,
        sessionCaptureAt: last.sessionCaptureAt,
        peakElapsedMin: last.peakElapsedMin,
        trackFrom: origin ?? (firstTrack?.peakAt ? trackingOriginMs(firstTrack.peakAt) : undefined),
        lastPrice: out.state.price,
        lastBarT: out.state.t,
        prevClose: out.state.prevClose,
        grid: dumpGrid(out.state.grid),
      };
    } catch {
      failed.add(row.ticker);
      return null;
    }
  });

  const pickedTickers = new Set(picked.map((row) => row.ticker));
  const items: WashoutBoardRow[] = [];
  for (const row of scored) {
    if (row) items.push(row);
  }
  items.sort((a, b) => b.score - a.score);
  const allFailed = picked.length > 0 && failed.size === picked.length && items.length === 0;
  if (!allFailed) {
    const still = new Set<string>();
    for (const row of items) still.add(row.ticker);
    for (const ticker of failed) {
      if (wasTracked.has(ticker)) still.add(ticker);
    }
    for (const ticker of wasTracked) {
      if (!pickedTickers.has(ticker)) still.add(ticker);
    }
    tracked.clear();
    for (const ticker of still) tracked.add(ticker);
    await persistTrackedBoard(
      [...tracked].map((ticker) => {
        const hit = items.find((row) => row.ticker === ticker);
        return {
          ticker,
          score: hit?.score ?? 0,
          ddPct: hit?.ddPct ?? 0,
          sessionElapsedMin: hit?.sessionElapsedMin ?? 0,
          sessionQuotaMin: hit?.sessionQuotaMin ?? 0,
          peakPrice: hit?.peakPrice,
          peakAt: hit?.peakAt,
          captureAt: hit?.captureAt,
          trackFrom: hit?.trackFrom ?? savedOrigins.get(ticker),
          lastPrice: hit?.lastPrice,
          lastBarT: hit?.lastBarT,
          prevClose: hit?.prevClose,
          grid: memberGrid(hit, now.getTime()) ?? hit?.grid,
          tapeDate: tapeYmd,
        };
      })
    );
    const granted = new Set(trackGrants);
    for (const ticker of wasTracked) granted.add(ticker);
    for (const row of items) granted.add(row.ticker);
    await persistTrackGrants(tapeYmd, granted);
  }
  if (tapeHighCache?.tapeYmd === tapeYmd) {
    await persistTapeHighs(tapeYmd, tapeHighCache.high);
  }

  const path = washoutIndexPath(seriesList);
  const reactionAt = new Map<number, number>();
  for (const point of washoutReactionIndexPath(seriesList)) {
    reactionAt.set(Math.floor(point.t / 60_000) * 60_000, point.score);
  }
  const rawSeries = path.map((point) => ({ t: point.t, v: point.score }));
  const axisStart = etWallMs(previousEtWeekday(tapeYmd), 16, 0);
  const hist = await loadSamplesSince(axisStart - 8 * 60 * 60 * 1000);
  const series = stitchCarry(
    [...hist.map((row) => ({ t: row.t, v: row.v, tape_date: row.tape_date })), ...rawSeries],
    axisStart,
    tapeYmd
  );
  const persistFrom = opts?.persistFromMs;
  const toStore =
    opts?.persistAll
      ? rawSeries.filter(
          (point) =>
            isInTapeDay(point.t, tapeYmd) && (persistFrom == null || point.t >= persistFrom)
        )
      : series;
  await persistSamples(
    toStore.map((point) => {
      const reaction = reactionAt.get(Math.floor(point.t / 60_000) * 60_000);
      return reaction == null ? point : { ...point, reaction };
    }),
    tapeYmd,
    { incremental: !opts?.persistAll }
  );
  return {
    index: washoutIndexAverage(
      items.map((row) => ({
        score: row.score,
        captureAt: row.captureAt,
        peakAt: row.peakAt,
        peakElapsedMin: row.peakElapsedMin,
      }))
    ),
    series: series.filter((point) => isInTapeDay(point.t, tapeYmd)),
    tapeYmd,
    items,
  };
}

const rangeCache = new Map<string, { at: number; payload: WashoutBoardPayload }>();
let liveCache: { at: number; live: LiveBundle } | null = null;

function rangeTtl(range: WashoutRange): number {
  return range === "1d" ? CACHE_MS : HIST_CACHE_MS;
}

async function getLive(force: boolean, opts?: CaptureWashoutOpts): Promise<LiveBundle> {
  const now = Date.now();
  if (!force && liveCache && now - liveCache.at < CACHE_MS) return liveCache.live;
  if (inflight) return inflight;
  inflight = computeLive(new Date(), opts)
    .then((live) => {
      liveCache = { at: Date.now(), live };
      return live;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function captureWashoutLive(opts?: CaptureWashoutOpts): Promise<LiveBundle> {
  return getLive(true, opts);
}

export async function getWashoutBoard(opts?: {
  force?: boolean;
  range?: WashoutRange;
  session?: UsTradingSession;
}): Promise<WashoutBoardPayload> {
  const range: WashoutRange = opts?.range ?? "1d";
  const session = opts?.session ?? activeTapeSession();
  const cacheKey = `${range}:${session}`;
  const now = Date.now();
  const cached = rangeCache.get(cacheKey);
  const ttl = rangeTtl(range);
  if (!opts?.force && cached && now - cached.at < ttl) {
    return { ...cached.payload, servedFromCache: true };
  }

  const trackedRows = await loadTrackedBoard();
  const live: LiveBundle = {
    index: 0,
    series: [],
    tapeYmd: boardTapeYmd(new Date(), session),
    items: trackedRows.map((row) => ({
      ticker: row.ticker,
      score: row.score,
      ddPct: row.ddPct,
      tracking: true,
      sessionElapsedMin: row.sessionElapsedMin,
      sessionQuotaMin: row.sessionQuotaMin,
    })),
  };
  const payload = await assembleRange(live, range, session);
  rangeCache.set(cacheKey, { at: Date.now(), payload });
  return payload;
}

const PUBLISHED_RANGES: WashoutRange[] = ["1d", "1w", "1m", "3m"];
const PUBLISHED_SESSIONS: UsTradingSession[] = ["afterhours", "premarket", "regular"];

/** 방문자 수와 무관하게, 한 번 만든 점수표를 그대로 나눠 준다. */
export async function getWashoutCatalog(): Promise<Record<string, WashoutBoardPayload>> {
  const now = new Date();
  const tapes = new Map<UsTradingSession, string>();
  const tapeSet = new Set<string>();
  for (const session of PUBLISHED_SESSIONS) {
    const tape = boardTapeYmd(now, session);
    tapes.set(session, tape);
    for (const day of tapeDatesBack(tape, 21)) tapeSet.add(day);
  }
  const samples = await loadSamplesForTapeDates([...tapeSet]);
  return boardsFromSamples(tapes, samples, PUBLISHED_RANGES);
}

/** 지금 세션의 1일 선만. 비교선·긴 기간은 전체 표가 이어서 채운다. */
export async function getWashoutLiveBoards(): Promise<Record<string, WashoutBoardPayload>> {
  const now = new Date();
  const tapes = new Map<UsTradingSession, string>();
  const tapeSet = new Set<string>();
  let reactionFrom = now.getTime();
  for (const session of PUBLISHED_SESSIONS) {
    const tape = boardTapeYmd(now, session);
    tapes.set(session, tape);
    tapeSet.add(tape);
    reactionFrom = Math.min(reactionFrom, sessionBounds(tape, "afterhours").start);
  }
  const samples = await loadSamplesForTapeDates([...tapeSet], { reactionFromMs: reactionFrom });
  return boardsFromSamples(tapes, samples, ["1d"]);
}

async function boardsFromSamples(
  tapes: Map<UsTradingSession, string>,
  samples: Array<{ t: number; v: number; tape_date?: string; reaction?: number }>,
  ranges: WashoutRange[]
): Promise<Record<string, WashoutBoardPayload>> {
  const boards: Record<string, WashoutBoardPayload> = {};
  for (const session of PUBLISHED_SESSIONS) {
    const live: LiveBundle = {
      index: 0,
      series: [],
      tapeYmd: tapes.get(session) ?? "",
      items: [],
    };
    for (const range of ranges) {
      boards[`${range}:${session}`] = await assembleRange(live, range, session, samples);
    }
  }
  return boards;
}

async function assembleRange(
  live: LiveBundle,
  range: WashoutRange,
  session: UsTradingSession,
  preloaded?: Array<{ t: number; v: number; tape_date?: string; reaction?: number }>
): Promise<WashoutBoardPayload> {
  const days = tapeDatesBack(live.tapeYmd, rangeDays(range));
  const compareDays = tapeDatesBack(live.tapeYmd, 21);
  const axisStart = sessionBounds(days[0], session).start;
  const axisEnd = sessionBounds(days[days.length - 1], session).end;
  const lookback = etWallMs(previousEtWeekday(compareDays[0]), 16, 0);
  const hist = preloaded ?? (await loadSamplesSince(lookback));
  const byT = new Map<number, { t: number; v: number; tape_date?: string; reaction?: number }>();
  for (const row of hist) {
    byT.set(row.t, { t: row.t, v: row.v, tape_date: row.tape_date, reaction: row.reaction });
  }
  for (const point of live.series) {
    const key = Math.floor(point.t / 60_000) * 60_000;
    const prev = byT.get(key);
    byT.set(key, {
      t: point.t,
      v: point.v,
      tape_date: live.tapeYmd,
      reaction: prev?.reaction,
    });
  }
  const merged = [...byT.values()].filter((row) => Number.isFinite(row.v)).sort((a, b) => a.t - b.t);
  const reactionRows = merged
    .filter((row) => row.reaction != null && Number.isFinite(row.reaction))
    .map((row) => ({ t: row.t, v: row.reaction as number, tape_date: row.tape_date }));
  const main = paintSession(merged, live, range, session, days);
  const reaction = paintSession(reactionRows, { ...live, index: 0 }, range, session, days);
  return {
    index: main.series.length ? asDump(main.index) : 0,
    series: main.series.map((p) => ({ ...p, v: asDump(p.v) })),
    items: live.items,
    range,
    session,
    axisStart,
    axisEnd,
    sessionDate: live.tapeYmd,
    fetchedAt: new Date().toISOString(),
    servedFromCache: false,
    compare: main.compare,
    reaction: {
      index: reaction.series.length ? asDump(reaction.index) : 0,
      series: reaction.series.map((p) => ({ ...p, v: asDump(p.v) })),
      compare: reaction.compare,
    },
  };
}

function paintSession(
  merged: Array<{ t: number; v: number; tape_date?: string }>,
  live: LiveBundle,
  range: WashoutRange,
  session: UsTradingSession,
  days: string[]
): { index: number; series: WashoutChartPoint[]; compare: WashoutCompare } {
  const rowTape = (row: { t: number; tape_date?: string }) =>
    (row.tape_date ?? "").slice(0, 10) || runnerTapeDate(new Date(row.t));
  const points =
    range === "1d"
      ? merged.filter((point) => {
          const tape = rowTape(point);
          return days.includes(tape) && tapeSessionAtMs(point.t, tape) === session;
        })
      : downsample(merged, range, days, session);
  const series = withX(points, days, range, session);
  const index = series.length ? series[series.length - 1].v : live.index;
  const tagged = merged.map((row) => ({ ...row, tape_date: rowTape(row) }));
  const bounds = sessionBounds(live.tapeYmd, session);
  const nowMs = Date.now();
  const latestTape = [...tagged]
    .reverse()
    .find((row) => row.tape_date === live.tapeYmd && tapeSessionAtMs(row.t, live.tapeYmd) === session);
  const atMs =
    nowMs >= bounds.start && nowMs < bounds.end ? nowMs : (latestTape?.t ?? bounds.start);
  const compare = washoutCompareAt(tagged, atMs, live.tapeYmd);
  compare.at = atMs;
  const rawPaths = washoutComparePaths(tagged, live.tapeYmd, points);
  compare.paths = {
    yesterday: withX(rawPaths.yesterday, days, range, session).map((p) => ({ ...p, v: asDump(p.v) })),
    avg5: withX(rawPaths.avg5, days, range, session).map((p) => ({ ...p, v: asDump(p.v) })),
    avg20: withX(rawPaths.avg20, days, range, session).map((p) => ({ ...p, v: asDump(p.v) })),
  };
  compare.yesterday = compare.yesterday == null ? null : asDump(compare.yesterday);
  compare.avg5 = compare.avg5 == null ? null : asDump(compare.avg5);
  compare.avg20 = compare.avg20 == null ? null : asDump(compare.avg20);
  return { index, series, compare };
}
