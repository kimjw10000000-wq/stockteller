import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { WASHOUT_TRACK_PCT, washoutIndexPath, type WashoutBar, type WashoutPoint } from "./washout-score";
import {
  isPolygonHaltError,
  polygonStarterKey,
  PolygonRateLimitError,
  type PolygonFetchOpts,
} from "./polygon-keys";
import { fetchGroupedDailyAdvanced, fetchMinuteAggs, scoreWithPeakSeconds } from "./washout-polygon";
import { loadTapeSampleBounds, loadTrackedTickers, persistSamples, persistTrackedTickers, toTenMinuteSamples } from "./washout-samples";
import { loadWashoutListedTickers } from "./washout-live";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isUsWeekday,
  previousEtWeekday,
  runnerTapeDate,
  sessionAtInstant,
  tapeDatesBack,
} from "./us-session";

function listingKey(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\./g, "-");
}

const MAX_TICKERS = 80;
const CONCURRENCY = 8;
const CURSOR_PATH = resolve(process.cwd(), ".washout-backfill-cursor.json");

type BackfillCursor = { lastTape: string; tickers: string[] };

function gatePct(high: number, prevClose: number): number {
  if (prevClose <= 0) return 0;
  return (high / prevClose - 1) * 100;
}

function isSessionBar(t: number): boolean {
  if (!isUsWeekday(new Date(t))) return false;
  return sessionAtInstant(new Date(t)) != null;
}

function clipSessionBars(bars: WashoutBar[]): WashoutBar[] {
  return bars.filter((bar) => isSessionBar(bar.t));
}

function mergeBars(prev: WashoutBar[], next: WashoutBar[]): WashoutBar[] {
  const by = new Map<number, WashoutBar>();
  for (const bar of prev) by.set(bar.t, bar);
  for (const bar of next) {
    const old = by.get(bar.t);
    if (old?.peakAt != null && old.peakAt !== old.t) {
      bar.peakAt = old.peakAt;
      bar.closeAt = old.closeAt;
    }
    by.set(bar.t, bar);
  }
  return [...by.values()].sort((a, b) => a.t - b.t);
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  shouldStop: () => boolean
): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  let halt: unknown = null;
  async function worker() {
    while (i < items.length) {
      if (shouldStop() || halt) return;
      const idx = i++;
      try {
        out[idx] = await fn(items[idx]);
      } catch (e) {
        halt = e;
        return;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  if (halt) throw halt;
  return out;
}

async function loadDoneTapeDates(): Promise<Set<string>> {
  const done = new Set<string>();
  try {
    const admin = createAdminClient();
    const page = 1000;
    for (let from = 0; ; from += page) {
      const { data, error } = await admin
        .from("washout_index_samples")
        .select("tape_date")
        .order("t", { ascending: true })
        .range(from, from + page - 1);
      if (error || !data) {
        if (error) console.error("[washout-backfill] loadDone", error.message);
        break;
      }
      for (const row of data) {
        const d = String(row.tape_date ?? "").slice(0, 10);
        if (d) done.add(d);
      }
      if (data.length < page) break;
    }
  } catch {
    /* 이어서 넣기만 포기하고 전부 다시 */
  }
  return done;
}

async function readCursor(): Promise<BackfillCursor | null> {
  try {
    const raw = JSON.parse(await readFile(CURSOR_PATH, "utf8")) as BackfillCursor;
    if (!raw?.lastTape) return null;
    const tickers = Array.isArray(raw.tickers)
      ? raw.tickers.map((t) => listingKey(String(t))).filter(Boolean)
      : [];
    return { lastTape: String(raw.lastTape).slice(0, 10), tickers };
  } catch {
    return null;
  }
}

async function writeCursor(lastTape: string, tickers: Iterable<string>): Promise<void> {
  const payload: BackfillCursor = {
    lastTape,
    tickers: [...new Set([...tickers].map(listingKey).filter(Boolean))].sort(),
  };
  await writeFile(CURSOR_PATH, `${JSON.stringify(payload)}\n`, "utf8");
  await persistTrackedTickers(payload.tickers);
}

/** 휴일처럼 앞뒤 거래일은 있는데 샘플만 없는 날은 구멍으로 보지 않는다. */
function firstUnfilledIndex(tapes: string[], done: Set<string>): number {
  for (let i = 0; i < tapes.length; i++) {
    if (done.has(tapes[i])) continue;
    const sandwiched =
      i > 0 &&
      done.has(tapes[i - 1]) &&
      i + 1 < tapes.length &&
      done.has(tapes[i + 1]);
    if (sandwiched) continue;
    return i;
  }
  return -1;
}

function resolveStart(
  tapes: string[],
  done: Set<string>,
  cursor: BackfillCursor | null
): { startIdx: number; tracking: string[] } {
  if (cursor) {
    const at = tapes.indexOf(cursor.lastTape);
    if (at >= 0) {
      return { startIdx: at + 1, tracking: cursor.tickers };
    }
  }
  const miss = firstUnfilledIndex(tapes, done);
  if (miss < 0) return { startIdx: tapes.length, tracking: [] };
  if (miss === 0) return { startIdx: 0, tracking: [] };
  return { startIdx: miss - 1, tracking: [] };
}

export async function backfillWashoutIndex(opts?: {
  days?: number;
  concurrency?: number;
  resume?: boolean;
  untilLive?: boolean;
  onDay?: (info: {
    tapeYmd: string;
    index: number;
    names: number;
    points: number;
    listed?: number;
    movers?: number;
    grouped?: number;
    skipped?: boolean;
    replay?: boolean;
  }) => void;
}): Promise<{ days: number; points: number }> {
  const days = opts?.days ?? 252;
  const concurrency = opts?.concurrency ?? CONCURRENCY;
  const resume = opts?.resume !== false;
  const untilLive = opts?.untilLive === true;
  const done = resume && !untilLive ? await loadDoneTapeDates() : new Set<string>();
  const cursor = resume ? await readCursor() : null;
  const key = polygonStarterKey();
  const listed = await loadWashoutListedTickers();
  const liveTape = runnerTapeDate(new Date());
  const tapes = tapeDatesBack(liveTape, days);
  const dbTracked = untilLive ? await loadTrackedTickers() : [];
  const start = untilLive
    ? {
        startIdx: Math.max(0, tapes.indexOf(liveTape)),
        tracking: [
          ...new Set([
            ...(cursor?.tickers ?? []),
            ...dbTracked,
          ]),
        ],
      }
    : resume
      ? resolveStart(tapes, done, cursor)
      : { startIdx: 0, tracking: [] as string[] };
  const abort = new AbortController();
  const polyOpts: PolygonFetchOpts = { haltOn429: true, signal: abort.signal };
  const groupedByDate = new Map<string, Map<string, { high: number; close: number; symbol: string }>>();

  if (resume) {
    console.log(
      JSON.stringify({
        resumeDates: done.size,
        cursor: cursor?.lastTape ?? null,
        cursorNames: cursor?.tickers.length ?? 0,
        startTape: tapes[start.startIdx] ?? null,
        seededNames: start.tracking.length,
      })
    );
  }
  if (start.startIdx >= tapes.length) {
    return { days: tapes.length, points: 0 };
  }

  async function grouped(
    date: string
  ): Promise<Map<string, { high: number; close: number; symbol: string }>> {
    const hit = groupedByDate.get(date);
    if (hit) return hit;
    const rows = await fetchGroupedDailyAdvanced(date, key, polyOpts);
    const map = new Map<string, { high: number; close: number; symbol: string }>();
    for (const row of rows) {
      map.set(listingKey(row.ticker), { high: row.high, close: row.close, symbol: row.ticker });
    }
    groupedByDate.set(date, map);
    return map;
  }

  async function lastSessionGrouped(date: string) {
    let cur = date;
    for (let i = 0; i < 8; i++) {
      const map = await grouped(cur);
      if (map.size > 0) return { date: cur, map };
      cur = previousEtWeekday(cur);
    }
    return { date, map: await grouped(date) };
  }

  const tracking = new Set<string>(start.tracking);
  const barsByTicker = new Map<string, WashoutBar[]>();
  let points = 0;
  const replayTape = !cursor && start.startIdx > 0 ? tapes[start.startIdx] : null;

  for (let ti = start.startIdx; ti < tapes.length; ti++) {
    const tapeYmd = tapes[ti];
    const prev = previousEtWeekday(tapeYmd);
    const prevSession = await lastSessionGrouped(prev);
    const from = previousEtWeekday(prevSession.date);
    const prevCloses = prevSession.map;
    const dayBars = await grouped(tapeYmd);
    const liveTape = runnerTapeDate(new Date());
    if (dayBars.size === 0 && (tapeYmd !== liveTape || tracking.size === 0)) {
      await writeCursor(tapeYmd, tracking);
      opts?.onDay?.({
        tapeYmd,
        index: 0,
        names: tracking.size,
        points: 0,
        listed: listed.size,
        movers: 0,
        grouped: 0,
      });
      continue;
    }
    const ranked: Array<{ ticker: string; symbol: string; prevClose: number; high: number }> = [];
    const seen = new Set<string>();
    const consider = new Set<string>([...tracking, ...dayBars.keys()]);
    for (const rawTicker of consider) {
      const ticker = listingKey(rawTicker);
      if (!listed.has(ticker) || seen.has(ticker)) continue;
      seen.add(ticker);
      const prevClose = prevCloses.get(ticker)?.close ?? prevCloses.get(rawTicker)?.close;
      if (prevClose == null || prevClose <= 0) continue;
      const high =
        dayBars.get(ticker)?.high ??
        dayBars.get(rawTicker)?.high ??
        prevCloses.get(ticker)?.high ??
        0;
      if (!tracking.has(ticker) && gatePct(high, prevClose) < WASHOUT_TRACK_PCT) continue;
      ranked.push({
        ticker,
        symbol: dayBars.get(ticker)?.symbol ?? prevCloses.get(ticker)?.symbol ?? ticker,
        prevClose,
        high,
      });
    }
    ranked.sort((a, b) => gatePct(b.high, b.prevClose) - gatePct(a.high, a.prevClose));
    const picked = [
      ...ranked.filter((row) => tracking.has(row.ticker)),
      ...ranked.filter((row) => !tracking.has(row.ticker)),
    ]
      .filter((row, i, all) => all.findIndex((x) => x.ticker === row.ticker) === i)
      .slice(0, MAX_TICKERS);

    const seriesList: WashoutPoint[][] = [];
    const still = new Set<string>();
    try {
      await mapPool(
        picked,
        concurrency,
        async (row) => {
          try {
            const nowMs = Date.now();
            const raw = await fetchMinuteAggs(row.symbol, from, tapeYmd, key, polyOpts);
            let bars = mergeBars(barsByTicker.get(row.ticker) ?? [], clipSessionBars(raw));
            const keepFrom = Date.parse(`${from}T00:00:00Z`) - 2 * 24 * 60 * 60 * 1000;
            bars = bars.filter((bar) => bar.t >= keepFrom && (tapeYmd !== liveTape || bar.t <= nowMs));
            for (const bar of bars) {
              const tape = runnerTapeDate(new Date(bar.t));
              let cur = previousEtWeekday(tape);
              let pc = row.prevClose;
              for (let i = 0; i < 8; i++) {
                const close = groupedByDate.get(cur)?.get(row.ticker)?.close;
                if (close != null && close > 0) {
                  pc = close;
                  break;
                }
                cur = previousEtWeekday(cur);
              }
              bar.prevClose = pc;
            }
            barsByTicker.set(row.ticker, bars);
            const series = await scoreWithPeakSeconds(bars, row.prevClose, row.symbol, key, polyOpts);
            const last = series.length ? series[series.length - 1] : null;
            if (!last?.tracking) {
              barsByTicker.delete(row.ticker);
              return;
            }
            still.add(row.ticker);
            seriesList.push(series);
          } catch (e) {
            if (isPolygonHaltError(e)) throw e;
            if (tracking.has(row.ticker)) still.add(row.ticker);
          }
        },
        () => abort.signal.aborted
      );
    } catch (e) {
      abort.abort();
      if (isPolygonHaltError(e)) {
        throw new PolygonRateLimitError();
      }
      throw e;
    }

    tracking.clear();
    for (const ticker of still) tracking.add(ticker);
    for (const ticker of [...barsByTicker.keys()]) {
      if (!tracking.has(ticker)) barsByTicker.delete(ticker);
    }

    const nowMs = Date.now();
    const path = washoutIndexPath(seriesList)
      .filter((point) => runnerTapeDate(new Date(point.t)) === tapeYmd)
      .filter((point) => tapeYmd !== liveTape || point.t <= nowMs)
      .map((point) => ({ t: point.t, v: point.score }));
    if (tapeYmd === liveTape) {
      const bounds = await loadTapeSampleBounds(tapeYmd);
      const catchUp = bounds ? path.filter((point) => point.t < bounds.minT) : path;
      await persistSamples(catchUp, tapeYmd, { incremental: false });
      await persistTrackedTickers([...tracking]);
      points += catchUp.length;
      const index = path.length ? path[path.length - 1].v : 0;
      opts?.onDay?.({
        tapeYmd,
        index,
        names: still.size,
        points: catchUp.length,
        listed: listed.size,
        movers: ranked.length,
        grouped: dayBars.size,
        replay: replayTape === tapeYmd,
      });
      if (untilLive) break;
      continue;
    }
    const compact = toTenMinuteSamples(path);
    await persistSamples(compact, tapeYmd, { incremental: false });
    await writeCursor(tapeYmd, tracking);
    points += compact.length;
    const index = path.length ? path[path.length - 1].v : 0;
    opts?.onDay?.({
      tapeYmd,
      index,
      names: still.size,
      points: compact.length,
      listed: listed.size,
      movers: ranked.length,
      grouped: dayBars.size,
      replay: replayTape === tapeYmd,
    });
    if (untilLive) break;
  }

  return { days: tapes.length, points };
}
