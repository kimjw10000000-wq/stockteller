import {
  washoutIndexAverage,
  washoutIndexPath,
  WASHOUT_TRACK_PCT,
  type WashoutBar,
  type WashoutPoint,
} from "./washout-score";
import { polygonAdvancedKeyOrNull, polygonGetWithKey } from "./polygon-keys";
import { fetchMinuteAggs, polygonTimeMs, scoreWithPeakSeconds } from "./washout-polygon";
import {
  etWallMs,
  isInTapeDay,
  isUsWeekday,
  previousEtWeekday,
  runnerTapeDate,
  sessionAtInstant,
  tapeDatesBack,
  tapeDayElapsedMin,
  TAPE_DAY_SESSION_MIN,
  usEtYmd,
  usSessionDateKey,
} from "./us-session";
import {
  loadSamplesSince,
  loadTrackedBoard,
  loadTrackedTickers,
  persistSamples,
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

const CACHE_MS = 5_000;
const HIST_CACHE_MS = 30_000;
const LISTED_MS = 10 * 60_000;
const MAX_TICKERS = 80;
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
  axisStart: number;
  axisEnd: number;
  sessionDate: string;
  fetchedAt: string;
  servedFromCache: boolean;
  error?: string;
};

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

function isCandidate(row: {
  ticker: string;
  prevClose: number;
  high: number;
  changePerc: number | null;
}): boolean {
  if (tracked.has(row.ticker)) return true;
  if (row.changePerc != null && row.changePerc >= WASHOUT_TRACK_PCT) return true;
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
  if (range === "1m") return 22;
  return 90;
}

function downsample(
  points: Array<{ t: number; v: number; tape_date?: string }>,
  range: WashoutRange,
  days: string[]
): Array<{ t: number; v: number; tape?: string }> {
  if (range === "1d" || points.length === 0) return points;
  const ordered = [...points].sort((a, b) => a.t - b.t);
  const by = new Map<string, { t: number; v: number; tape: string }>();
  for (const point of ordered) {
    const tape =
      (point.tape_date ?? "").slice(0, 10) || runnerTapeDate(new Date(point.t));
    const i = days.indexOf(tape);
    if (i < 0) continue;
    let key: string;
    if (range === "1w") {
      key = `${tape}:${Math.floor(tapeDayElapsedMin(point.t, tape) / 10)}`;
    } else {
      key = tape;
    }
    by.set(key, { t: point.t, v: point.v, tape });
  }
  return [...by.values()].sort((a, b) => a.t - b.t);
}

function xOnAxis(
  t: number,
  days: string[],
  range: WashoutRange,
  tapeHint?: string
): number {
  const n = days.length;
  if (n <= 0) return 0;
  const tape = (tapeHint ?? "").slice(0, 10) || runnerTapeDate(new Date(t));
  const i = days.indexOf(tape);
  if (i < 0) {
    if (t < etWallMs(previousEtWeekday(days[0]), 16, 0)) return 0;
    if (t >= etWallMs(days[n - 1], 16, 0)) return 1;
    return -1;
  }
  if (range === "1m" || range === "3m") {
    return n === 1 ? 1 : i / (n - 1);
  }
  const total = n * TAPE_DAY_SESSION_MIN;
  return (i * TAPE_DAY_SESSION_MIN + tapeDayElapsedMin(t, tape)) / total;
}

function withX(
  points: Array<{ t: number; v: number; tape?: string; tape_date?: string }>,
  days: string[],
  range: WashoutRange
): WashoutChartPoint[] {
  const out: WashoutChartPoint[] = [];
  for (const point of points) {
    const x = xOnAxis(point.t, days, range, point.tape ?? point.tape_date);
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

function refClose(raw: SnapshotRow, tapeYmd: string, nowYmd: string): number | null {
  if (tapeYmd === nowYmd) {
    const close = raw.prevDay?.c;
    return close != null && Number.isFinite(close) && close > 0 ? close : null;
  }
  const close = raw.day?.c ?? raw.prevDay?.c;
  return close != null && Number.isFinite(close) && close > 0 ? close : null;
}

async function loadSessionHotTickers(dates: string[]): Promise<string[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("session_gainers")
      .select("ticker,peak_change_pct")
      .in("session_date", dates)
      .gte("peak_change_pct", WASHOUT_TRACK_PCT);
    if (error || !data) return [];
    return data
      .map((row) => listingKey(String(row.ticker ?? "")))
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function computeLive(now = new Date()): Promise<LiveBundle> {
  const tapeYmd = runnerTapeDate(now);
  const empty: LiveBundle = { index: 0, series: [], tapeYmd, items: [] };
  const key = polygonAdvancedKeyOrNull();
  if (!key) return empty;
  const nowYmd = usEtYmd(now);
  const prev = previousEtWeekday(tapeYmd);
  const from = prev;
  const startMs = etWallMs(prev, 16, 0);
  const to = tapeYmd < nowYmd ? nowYmd : tapeYmd > nowYmd ? nowYmd : tapeYmd;
  for (const ticker of await loadTrackedTickers()) tracked.add(ticker);
  for (const ticker of await loadSessionHotTickers([nowYmd, prev, usSessionDateKey(now)])) {
    tracked.add(ticker);
  }
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
      const prevClose = refClose(raw, tapeYmd, nowYmd);
      const print = maxNum(
        raw.day?.h,
        raw.day?.c,
        raw.min?.h,
        raw.min?.c,
        raw.lastTrade?.p,
        raw.lastQuote?.p
      );
      const high = rememberTapeHigh(tapeYmd, ticker, print);
      if (!ticker || prevClose == null || high == null) return null;
      const changePerc =
        raw.todaysChangePerc != null && Number.isFinite(raw.todaysChangePerc)
          ? raw.todaysChangePerc
          : null;
      return { ticker, quoteTicker, prevClose, high, changePerc };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  const mappedBy = new Map<string, (typeof mappedRaw)[number]>();
  for (const row of mappedRaw) {
    const prev = mappedBy.get(row.ticker);
    if (!prev || rank(row) > rank(prev)) mappedBy.set(row.ticker, row);
  }
  const mapped = [...mappedBy.values()];
  const candidates = mapped.filter(isCandidate);
  candidates.sort((a, b) => rank(b) - rank(a));
  const picked = candidates.slice(0, MAX_TICKERS);

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
      for (const bar of bars) bar.prevClose = row.prevClose;
      const snap = snapBy.get(quoteTicker) ?? snapBy.get(ticker);
      const fromSnap = snap ? livePrint(snap) : null;
      const live = lastTrade
        ? {
            t: lastTrade.t,
            price: lastTrade.p,
            high: Math.max(lastTrade.p, snap?.min?.h ?? lastTrade.p),
          }
        : fromSnap;
      bars = mergeLiveBar(bars, live, row.prevClose, startMs);
      const series = await scoreWithPeakSeconds(bars, row.prevClose, row.ticker, key);
      const last = series.length ? series[series.length - 1] : null;
      if (!last?.tracking) return null;
      seriesList.push(series);
      return {
        ticker: row.ticker,
        score: last.score,
        ddPct: last.ddPct,
        tracking: last.tracking,
        sessionElapsedMin: last.sessionElapsedMin,
        sessionQuotaMin: last.sessionQuotaMin,
      } satisfies WashoutBoardRow;
    } catch {
      failed.add(row.ticker);
      return null;
    }
  });

  const items: WashoutBoardRow[] = [];
  for (const row of scored) {
    if (row) items.push(row);
  }
  items.sort((a, b) => b.score - a.score);
  const allFailed = picked.length > 0 && failed.size === picked.length && items.length === 0;
  if (!allFailed) {
    tracked.clear();
    for (const row of items) tracked.add(row.ticker);
    for (const ticker of failed) {
      if (wasTracked.has(ticker)) tracked.add(ticker);
    }
    await persistTrackedBoard(
      [...tracked].map((ticker) => {
        const hit = items.find((row) => row.ticker === ticker);
        return {
          ticker,
          score: hit?.score ?? 0,
          ddPct: hit?.ddPct ?? 0,
          sessionElapsedMin: hit?.sessionElapsedMin ?? 0,
          sessionQuotaMin: hit?.sessionQuotaMin ?? 0,
        };
      })
    );
  }

  const path = washoutIndexPath(seriesList);
  const series = path.map((point) => ({ t: point.t, v: point.score }));
  await persistSamples(series, tapeYmd);
  return {
    index: washoutIndexAverage(items.map((row) => row.score)),
    series: series.filter((point) => isInTapeDay(point.t, tapeYmd)),
    tapeYmd,
    items,
  };
}

const rangeCache = new Map<WashoutRange, { at: number; payload: WashoutBoardPayload }>();
let liveCache: { at: number; live: LiveBundle } | null = null;

function rangeTtl(range: WashoutRange): number {
  return range === "1d" ? CACHE_MS : HIST_CACHE_MS;
}

async function getLive(force: boolean): Promise<LiveBundle> {
  const now = Date.now();
  if (!force && liveCache && now - liveCache.at < CACHE_MS) return liveCache.live;
  if (inflight) return inflight;
  inflight = computeLive()
    .then((live) => {
      liveCache = { at: Date.now(), live };
      return live;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function captureWashoutLive(): Promise<LiveBundle> {
  return getLive(true);
}

export async function getWashoutBoard(opts?: {
  force?: boolean;
  range?: WashoutRange;
}): Promise<WashoutBoardPayload> {
  const range: WashoutRange = opts?.range ?? "1d";
  const now = Date.now();
  const cached = rangeCache.get(range);
  const ttl = rangeTtl(range);
  if (!opts?.force && cached && now - cached.at < ttl) {
    return { ...cached.payload, servedFromCache: true };
  }

  const trackedRows = await loadTrackedBoard();
  const live: LiveBundle = {
    index: 0,
    series: [],
    tapeYmd: runnerTapeDate(new Date()),
    items: trackedRows.map((row) => ({
      ticker: row.ticker,
      score: row.score,
      ddPct: row.ddPct,
      tracking: true,
      sessionElapsedMin: row.sessionElapsedMin,
      sessionQuotaMin: row.sessionQuotaMin,
    })),
  };
  const payload = await assembleRange(live, range);
  rangeCache.set(range, { at: Date.now(), payload });
  return payload;
}

async function assembleRange(live: LiveBundle, range: WashoutRange): Promise<WashoutBoardPayload> {
  const days = tapeDatesBack(live.tapeYmd, rangeDays(range));
  const axisStart = etWallMs(previousEtWeekday(days[0]), 16, 0);
  const axisEnd = etWallMs(days[days.length - 1], 16, 0);
  const hist = await loadSamplesSince(axisStart);
  const byT = new Map<number, { t: number; v: number; tape_date?: string }>();
  for (const row of hist) byT.set(row.t, { t: row.t, v: row.v, tape_date: row.tape_date });
  for (const point of live.series) {
    byT.set(Math.floor(point.t / 60_000) * 60_000, { t: point.t, v: point.v });
  }
  const merged = [...byT.values()].sort((a, b) => a.t - b.t);
  const points = range === "1d" ? merged : downsample(merged, range, days);
  const series = withX(points, days, range);
  const index = series.length ? series[series.length - 1].v : live.index;
  return {
    index,
    series,
    items: live.items,
    range,
    axisStart,
    axisEnd,
    sessionDate: live.tapeYmd,
    fetchedAt: new Date().toISOString(),
    servedFromCache: false,
  };
}
