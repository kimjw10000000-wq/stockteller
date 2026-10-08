import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { washoutScoreForIndex } from "./washout-score";
import { activeTapeSession, runnerTapeDate, tapeDayElapsedMin, type UsTradingSession } from "./us-session";

export type WashoutSample = {
  t: number;
  v: number;
  tape_date: string;
  /** 현재반응 설거지 지수. 열이 생기기 전 행은 없다. */
  reaction?: number;
};

const mem = new Map<number, WashoutSample>();
const TAPE_HIGH_FILE = resolve(process.cwd(), ".washout-tape-highs.json");
const TRACKED_FILE = resolve(process.cwd(), ".washout-tracked.json");
const GRANTS_FILE = resolve(process.cwd(), ".washout-grants.json");

function readJsonFile<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJsonFile(path: string, value: unknown): void {
  if (process.env.VERCEL) return;
  try {
    writeFileSync(path, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function minuteKey(t: number): number {
  return Math.floor(t / 60_000) * 60_000;
}

export function rememberSamples(
  points: Array<{ t: number; v: number; reaction?: number }>,
  tapeDate: string
): void {
  for (const point of points) {
    const t = minuteKey(point.t);
    const prev = mem.get(t);
    const reaction = point.reaction != null && Number.isFinite(point.reaction) ? point.reaction : prev?.reaction;
    mem.set(t, {
      t,
      v: point.v,
      tape_date: runnerTapeDate(new Date(point.t)) || tapeDate,
      ...(reaction != null ? { reaction } : {}),
    });
  }
}

export function memorySamplesSince(fromMs: number): WashoutSample[] {
  const out: WashoutSample[] = [];
  for (const row of mem.values()) {
    if (row.t >= fromMs) out.push(row);
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

let lastPersistedT = 0;
let samplesQueryCache: { fromMs: number; at: number; rows: WashoutSample[] } | null = null;
const SAMPLES_CACHE_MS = 2_000;

export function toTenMinuteSamples(
  points: Array<{ t: number; v: number }>
): Array<{ t: number; v: number }> {
  const by = new Map<string, { t: number; v: number }>();
  for (const point of points) {
    const tape = runnerTapeDate(new Date(point.t));
    const bucket = Math.floor(tapeDayElapsedMin(point.t, tape) / 10);
    by.set(`${tape}:${bucket}`, point);
  }
  return [...by.values()].sort((a, b) => a.t - b.t);
}

export async function deleteSamplesFromTape(tapeDate: string, fromMs: number): Promise<number> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("washout_index_samples")
      .delete()
      .eq("tape_date", tapeDate)
      .gte("t", new Date(fromMs).toISOString())
      .select("t");
    if (error) throw error;
    samplesQueryCache = null;
    lastPersistedT = 0;
    for (const t of [...mem.keys()]) {
      if (t >= fromMs) mem.delete(t);
    }
    return data?.length ?? 0;
  } catch (e) {
    console.error("[washout] deleteSamplesFromTape failed", e instanceof Error ? e.message : e);
    return 0;
  }
}

/** 현재반응 점수는 같은 분에서 1ms 뒤, 없는 테이프 날짜로 둔다. 원 지수 행과 시각 키가 겹치지 않게. */
const REACTION_TAPE = "2099-01-01";
const REACTION_SHIFT_MS = 1;

function isReactionTape(tape: string): boolean {
  return tape.slice(0, 10) === REACTION_TAPE;
}

function sampleFromRow(row: { t: string; v: number; tape_date: string }): WashoutSample | null {
  const t = Date.parse(String(row.t));
  if (!Number.isFinite(t)) return null;
  return {
    t: minuteKey(t),
    v: Number(row.v),
    tape_date: String(row.tape_date),
  };
}

export async function persistSamples(
  points: Array<{ t: number; v: number; reaction?: number }>,
  tapeDate: string,
  opts?: { incremental?: boolean; reactionOnly?: boolean }
): Promise<void> {
  rememberSamples(points, tapeDate);
  if (points.length === 0) return;
  const incremental = opts?.incremental !== false;
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const lastT = minuteKey(sorted[sorted.length - 1].t);
  const fromT = incremental
    ? lastPersistedT > 0
      ? lastPersistedT
      : lastT - 2 * 60_000
    : 0;
  const fresh = incremental ? sorted.filter((p) => minuteKey(p.t) >= fromT) : sorted;
  const byMinute = new Map<number, { t: number; v: number; reaction?: number }>();
  for (const point of fresh) byMinute.set(minuteKey(point.t), point);
  const unique = [...byMinute.values()].sort((a, b) => a.t - b.t);
  if (unique.length === 0) return;
  try {
    const admin = createAdminClient();
    const rows = unique.map((point) => ({
      t: new Date(minuteKey(point.t)).toISOString(),
      v: point.v,
      tape_date: runnerTapeDate(new Date(point.t)) || tapeDate,
    }));
    const reactionRows = unique
      .filter((point) => point.reaction != null && Number.isFinite(point.reaction))
      .map((point) => ({
        t: new Date(minuteKey(point.t) + REACTION_SHIFT_MS).toISOString(),
        v: point.reaction as number,
        tape_date: REACTION_TAPE,
      }));
    const chunk = 400;
    if (!opts?.reactionOnly) {
      for (let i = 0; i < rows.length; i += chunk) {
        const { error } = await admin.from("washout_index_samples").upsert(rows.slice(i, i + chunk), {
          onConflict: "t",
        });
        if (error) throw error;
      }
    }
    for (let i = 0; i < reactionRows.length; i += chunk) {
      const { error } = await admin
        .from("washout_index_samples")
        .upsert(reactionRows.slice(i, i + chunk), { onConflict: "t" });
      if (error) throw error;
    }
    lastPersistedT = Math.max(lastPersistedT, ...unique.map((p) => minuteKey(p.t)));
    samplesQueryCache = null;
  } catch (e) {
    const extra =
      e && typeof e === "object"
        ? JSON.stringify(e)
        : String(e);
    console.error("[washout] persistSamples failed", extra);
  }
}

/** 20거래일 비교선이 1분 점으로 남도록, 달력 45일까지는 1분을 유지한다. */
const KEEP_MINUTE_MS = 45 * 24 * 60 * 60 * 1000;
const KEEP_HISTORY_MS = 400 * 24 * 60 * 60 * 1000;

export async function compactOldWashoutSamples(now = Date.now()): Promise<{
  compacted: number;
  pruned: number;
}> {
  const pruneBefore = now - KEEP_HISTORY_MS;
  const compactBefore = now - KEEP_MINUTE_MS;
  try {
    const admin = createAdminClient();
    const { error: pruneErr } = await admin
      .from("washout_index_samples")
      .delete()
      .lt("t", new Date(pruneBefore).toISOString());
    if (pruneErr) throw pruneErr;
    const old = await loadSamplesSince(pruneBefore);
    const stale = old.filter((row) => row.t < compactBefore);
    if (stale.length === 0) return { compacted: 0, pruned: 0 };
    const keep = toTenMinuteSamples(stale);
    const keepT = new Set(keep.map((row) => minuteKey(row.t)));
    await persistSamples(keep, keep[0] ? runnerTapeDate(new Date(keep[0].t)) : "", {
      incremental: false,
    });
    const drop = stale.filter((row) => !keepT.has(minuteKey(row.t)));
    const chunk = 200;
    for (let i = 0; i < drop.length; i += chunk) {
      const ids = drop.slice(i, i + chunk).map((row) => new Date(row.t).toISOString());
      const { error } = await admin.from("washout_index_samples").delete().in("t", ids);
      if (error) throw error;
    }
    samplesQueryCache = null;
    return { compacted: keep.length, pruned: drop.length };
  } catch {
    return { compacted: 0, pruned: 0 };
  }
}

export async function loadTrackedOrigins(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("washout_tracked_tickers").select("ticker,track_from");
    if (!error && data) {
      for (const row of data) {
        const ticker = String(row.ticker ?? "").trim().toUpperCase();
        const at = row.track_from != null ? Date.parse(String(row.track_from)) : NaN;
        if (ticker && Number.isFinite(at) && at > 0) out.set(ticker, at);
      }
    }
  } catch {
    /* 컬럼 없으면 파일 */
  }
  const saved = readJsonFile<{ trackFrom?: Record<string, number> }>(TRACKED_FILE);
  for (const [ticker, at] of Object.entries(saved?.trackFrom ?? {})) {
    if (out.has(ticker.toUpperCase())) continue;
    if (Number.isFinite(at) && at > 0) out.set(ticker.toUpperCase(), at);
  }
  return out;
}

export async function loadTrackGrants(grantDate: string): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("washout_track_grants")
      .select("ticker")
      .eq("grant_date", grantDate);
    if (!error && data) {
      for (const row of data) {
        const ticker = String(row.ticker ?? "").trim().toUpperCase();
        if (ticker) out.add(ticker);
      }
    }
  } catch {
    /* 테이블 없으면 파일 */
  }
  const saved = readJsonFile<{ date?: string; tickers?: string[] }>(GRANTS_FILE);
  if (saved?.date === grantDate) {
    for (const ticker of saved.tickers ?? []) {
      const t = ticker.trim().toUpperCase();
      if (t) out.add(t);
    }
  }
  return out;
}

export async function persistTrackGrants(grantDate: string, tickers: Iterable<string>): Promise<void> {
  const uniq = [...new Set([...tickers].map((t) => t.trim().toUpperCase()).filter(Boolean))];
  writeJsonFile(GRANTS_FILE, { date: grantDate, tickers: uniq });
  if (uniq.length === 0) return;
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("washout_track_grants").upsert(
      uniq.map((ticker) => ({ ticker, grant_date: grantDate })),
      { onConflict: "ticker,grant_date" }
    );
    if (error) throw error;
  } catch (e) {
    console.error(
      "[washout] persistTrackGrants failed",
      e && typeof e === "object" ? JSON.stringify(e) : e
    );
  }
}

export async function loadTrackedPeaks(): Promise<
  Map<string, { price: number; at: number }>
> {
  const out = new Map<string, { price: number; at: number }>();
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("washout_tracked_tickers")
      .select("ticker,peak_price,peak_at,tape_date");
    const rows =
      error || !data
        ? (
            await admin
              .from("washout_tracked_tickers")
              .select("ticker,peak_price,tape_date")
          ).data
        : data;
    if (!rows) return out;
    for (const row of rows) {
      const ticker = String(row.ticker ?? "").trim().toUpperCase();
      const peak = Number(row.peak_price);
      if (!ticker || !Number.isFinite(peak) || peak <= 0) continue;
      const atRaw = "peak_at" in row && row.peak_at != null ? Date.parse(String(row.peak_at)) : NaN;
      out.set(ticker, { price: peak, at: Number.isFinite(atRaw) ? atRaw : 0 });
    }
  } catch {
    /* 컬럼 없으면 빈 맵 */
  }
  return out;
}

export async function loadTrackedTickers(): Promise<string[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("washout_tracked_tickers").select("ticker");
    if (error || !data) {
      /* file fallback */
    } else {
      const fromDb = data
        .map((row) => String(row.ticker ?? "").trim().toUpperCase())
        .filter(Boolean);
      if (fromDb.length) return fromDb;
    }
  } catch {
    /* file fallback */
  }
  const saved = readJsonFile<{ tickers?: string[] }>(TRACKED_FILE);
  return (saved?.tickers ?? []).map((ticker) => ticker.trim().toUpperCase()).filter(Boolean);
}

export async function persistTrackedTickers(tickers: string[]): Promise<void> {
  await persistTrackedBoard(tickers.map((ticker) => ({ ticker })));
}

export async function loadTapeHighs(tapeDate: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("washout_tape_highs")
      .select("ticker,high")
      .eq("tape_date", tapeDate);
    if (error || !data) {
      /* file fallback */
    } else {
      for (const row of data) {
        const ticker = String(row.ticker ?? "").trim().toUpperCase();
        const high = Number(row.high);
        if (ticker && Number.isFinite(high) && high > 0) out.set(ticker, high);
      }
    }
  } catch {
    /* 테이블이 없으면 파일 */
  }
  if (out.size === 0) {
    const saved = readJsonFile<{ tapeDate?: string; highs?: Record<string, number> }>(TAPE_HIGH_FILE);
    if (saved?.tapeDate === tapeDate && saved.highs) {
      for (const [ticker, high] of Object.entries(saved.highs)) {
        if (Number.isFinite(high) && high > 0) out.set(ticker.toUpperCase(), high);
      }
    }
  }
  return out;
}

export async function persistTapeHighs(tapeDate: string, highs: Map<string, number>): Promise<void> {
  const rows = [...highs.entries()]
    .filter(([, high]) => Number.isFinite(high) && high > 0)
    .map(([ticker, high]) => ({
      tape_date: tapeDate,
      ticker,
      high,
    }));
  if (rows.length === 0) return;
  writeJsonFile(TAPE_HIGH_FILE, {
    tapeDate,
    highs: Object.fromEntries(rows.map((row) => [row.ticker, row.high])),
  });
  try {
    const admin = createAdminClient();
    const chunk = 400;
    for (let i = 0; i < rows.length; i += chunk) {
      const { error } = await admin.from("washout_tape_highs").upsert(rows.slice(i, i + chunk), {
        onConflict: "tape_date,ticker",
      });
      if (error) throw error;
    }
  } catch (e) {
    console.error(
      "[washout] persistTapeHighs failed",
      e && typeof e === "object" ? JSON.stringify(e) : e
    );
  }
}

export async function persistTrackedBoard(
  rows: Array<{
    ticker: string;
    score?: number;
    ddPct?: number;
    sessionElapsedMin?: number;
    sessionQuotaMin?: number;
    peakPrice?: number;
    peakAt?: number;
    trackFrom?: number;
    lastPrice?: number;
    lastBarT?: number;
    prevClose?: number;
    grid?: Record<string, number | string>;
    tapeDate?: string;
  }>
): Promise<void> {
  const uniq = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const ticker = row.ticker.trim().toUpperCase();
    if (ticker) uniq.set(ticker, { ...row, ticker });
  }
  const trackFrom: Record<string, number> = {};
  for (const row of uniq.values()) {
    if (row.trackFrom != null && row.trackFrom > 0) trackFrom[row.ticker] = row.trackFrom;
  }
  writeJsonFile(TRACKED_FILE, { tickers: [...uniq.keys()], trackFrom });
  try {
    const admin = createAdminClient();
    if (uniq.size === 0) {
      await admin.from("washout_tracked_tickers").delete().neq("ticker", "");
      return;
    }
    const payload = [...uniq.values()].map((row) => ({
      ticker: row.ticker,
      score: row.score ?? null,
      dd_pct: row.ddPct ?? null,
      session_elapsed_min: row.sessionElapsedMin ?? null,
      session_quota_min: row.sessionQuotaMin ?? null,
      peak_price: row.peakPrice ?? null,
      peak_at: row.peakAt != null && row.peakAt > 0 ? new Date(row.peakAt).toISOString() : null,
      track_from: row.trackFrom != null && row.trackFrom > 0 ? new Date(row.trackFrom).toISOString() : null,
      last_price: row.lastPrice ?? null,
      last_bar_t: row.lastBarT != null ? new Date(row.lastBarT).toISOString() : null,
      prev_close: row.prevClose ?? null,
      grid: row.grid ?? {},
      tape_date: row.tapeDate ?? null,
    }));
    const { error } = await admin.from("washout_tracked_tickers").upsert(payload, {
      onConflict: "ticker",
    });
    if (error) {
      const { error: plainErr } = await admin.from("washout_tracked_tickers").upsert(
        payload.map((row) => ({
          ticker: row.ticker,
          score: row.score,
          dd_pct: row.dd_pct,
          session_elapsed_min: row.session_elapsed_min,
          session_quota_min: row.session_quota_min,
        })),
        { onConflict: "ticker" }
      );
      if (plainErr) throw plainErr;
    }
    const keep = [...uniq.keys()];
    const { error: extraErr } = await admin
      .from("washout_tracked_tickers")
      .delete()
      .not("ticker", "in", `(${keep.join(",")})`);
    if (extraErr) throw extraErr;
  } catch (e) {
    console.error(
      "[washout] persistTrackedBoard failed",
      e && typeof e === "object" ? JSON.stringify(e) : e
    );
  }
}

export async function loadTrackedBoard(): Promise<
  Array<{
    ticker: string;
    score: number;
    ddPct: number;
    sessionElapsedMin: number;
    sessionQuotaMin: number;
  }>
> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("washout_tracked_tickers")
      .select("ticker,score,dd_pct,session_elapsed_min,session_quota_min");
    if (error || !data) {
      const tickers = await loadTrackedTickers();
      return tickers.map((ticker) => ({
        ticker,
        score: 0,
        ddPct: 0,
        sessionElapsedMin: 0,
        sessionQuotaMin: 0,
      }));
    }
    return data
      .map((row) => {
        const ticker = String(row.ticker ?? "").trim().toUpperCase();
        if (!ticker) return null;
        return {
          ticker,
          score: Number(row.score) || 0,
          ddPct: Number(row.dd_pct) || 0,
          sessionElapsedMin: Number(row.session_elapsed_min) || 0,
          sessionQuotaMin: Number(row.session_quota_min) || 0,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
      .sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}

export type WashoutMember = { ticker: string; score: number };

export type WashoutMemberLists = {
  session: UsTradingSession | null;
  index: WashoutMember[];
  reaction: WashoutMember[];
};

const MEMBER_SESSIONS = new Set<UsTradingSession>(["afterhours", "premarket", "regular"]);

function dumpScore(v: number): number {
  if (!Number.isFinite(v) || v === 0) return 0;
  return -Math.abs(v);
}

function gridNumber(grid: Record<string, unknown> | null, key: string): number | null {
  if (!grid) return null;
  const n = Number(grid[key]);
  return Number.isFinite(n) ? n : null;
}

/** 지금 장의 설거지 지수·현재반응 지수에 들어간 종목과 표시 점수. */
export async function loadWashoutMembers(): Promise<WashoutMemberLists> {
  const live = activeTapeSession();
  const empty: WashoutMemberLists = { session: live, index: [], reaction: [] };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("washout_tracked_tickers").select("ticker,score,grid");
    if (error || !data) return empty;
    const index: WashoutMember[] = [];
    const reaction: WashoutMember[] = [];
    for (const row of data) {
      const ticker = String(row.ticker ?? "").trim().toUpperCase();
      if (!ticker) continue;
      const grid =
        row.grid && typeof row.grid === "object" && !Array.isArray(row.grid)
          ? (row.grid as Record<string, unknown>)
          : null;
      const rowSession = grid?.session;
      if (typeof rowSession === "string" && MEMBER_SESSIONS.has(rowSession as UsTradingSession)) {
        if (rowSession !== live) continue;
      }
      const flag = gridNumber(grid, "inIndex");
      if (flag === 0) continue;
      const stored = gridNumber(grid, "indexScore");
      const raw = Number(row.score);
      const contribution = stored != null ? stored : washoutScoreForIndex(Number.isFinite(raw) ? raw : 0);
      const shown = { ticker, score: dumpScore(contribution) };
      index.push(shown);
      if (gridNumber(grid, "inReaction") === 1) reaction.push(shown);
    }
    index.sort((a, b) => a.score - b.score || a.ticker.localeCompare(b.ticker));
    reaction.sort((a, b) => a.score - b.score || a.ticker.localeCompare(b.ticker));
    return { session: live, index, reaction };
  } catch {
    return empty;
  }
}

export async function loadTapeSampleBounds(tapeDate: string): Promise<{ minT: number; maxT: number } | null> {
  try {
    const admin = createAdminClient();
    const { data: first, error: a } = await admin
      .from("washout_index_samples")
      .select("t")
      .eq("tape_date", tapeDate)
      .order("t", { ascending: true })
      .limit(1);
    if (a || !first?.length) return null;
    const { data: last, error: b } = await admin
      .from("washout_index_samples")
      .select("t")
      .eq("tape_date", tapeDate)
      .order("t", { ascending: false })
      .limit(1);
    if (b || !last?.length) return null;
    const minT = Date.parse(String(first[0].t));
    const maxT = Date.parse(String(last[0].t));
    if (!Number.isFinite(minT) || !Number.isFinite(maxT)) return null;
    return { minT, maxT };
  } catch {
    return null;
  }
}

function absorbSampleRow(
  byT: Map<number, WashoutSample>,
  row: { t: string; v: number; tape_date: string }
): void {
  const parsed = Date.parse(String(row.t));
  if (!Number.isFinite(parsed)) return;
  const key = minuteKey(parsed);
  if (isReactionTape(String(row.tape_date))) {
    const prev = byT.get(key);
    if (prev) prev.reaction = Number(row.v);
    else byT.set(key, { t: key, v: Number.NaN, tape_date: "", reaction: Number(row.v) });
    return;
  }
  const sample = sampleFromRow(row);
  if (!sample) return;
  const prev = byT.get(sample.t);
  if (prev?.reaction != null) sample.reaction = prev.reaction;
  byT.set(sample.t, sample);
}

async function loadReactionMap(
  admin: ReturnType<typeof createAdminClient>,
  fromMs: number
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  const end = Date.now() + 60_000;
  const slices = 8;
  const step = Math.max(60_000, Math.ceil((end - fromMs) / slices));
  await Promise.all(
    Array.from({ length: slices }, (_, i) => {
      const start = fromMs + i * step;
      const stop = i === slices - 1 ? end : start + step;
      return (async () => {
        let cursor = new Date(start).toISOString();
        const stopIso = new Date(stop).toISOString();
        for (let n = 0; n < 8; n++) {
          const { data, error } = await admin
            .from("washout_index_samples")
            .select("t,v")
            .eq("tape_date", REACTION_TAPE)
            .gte("t", cursor)
            .lt("t", stopIso)
            .order("t", { ascending: true })
            .limit(1000);
          if (error || !data?.length) return;
          for (const row of data) {
            const t = Date.parse(String(row.t));
            if (Number.isFinite(t)) map.set(minuteKey(t), Number(row.v));
          }
          if (data.length < 1000) return;
          const last = Date.parse(String(data[data.length - 1].t));
          if (!Number.isFinite(last)) return;
          cursor = new Date(last + 1).toISOString();
        }
      })();
    })
  );
  return map;
}

export async function loadSamplesSince(fromMs: number): Promise<WashoutSample[]> {
  const now = Date.now();
  if (
    samplesQueryCache &&
    samplesQueryCache.fromMs <= fromMs &&
    now - samplesQueryCache.at < SAMPLES_CACHE_MS
  ) {
    const cached = samplesQueryCache.rows.filter((row) => row.t >= fromMs);
    const fromMem = memorySamplesSince(fromMs);
    const byT = new Map<number, WashoutSample>();
    for (const row of cached) byT.set(row.t, row);
    for (const row of fromMem) byT.set(row.t, row);
    return [...byT.values()].sort((a, b) => a.t - b.t);
  }
  const fromMem = memorySamplesSince(fromMs);
  try {
    const admin = createAdminClient();
    const byT = new Map<number, WashoutSample>();
    for (const row of fromMem) byT.set(row.t, row);
    const page = 1000;
    let cursor = new Date(fromMs).toISOString();
    for (let n = 0; n < 400; n++) {
      const { data, error } = await admin
        .from("washout_index_samples")
        .select("t,v,tape_date")
        .gte("t", cursor)
        .order("t", { ascending: true })
        .limit(page);
      if (error || !data?.length) break;
      for (const row of data) absorbSampleRow(byT, row);
      if (data.length < page) break;
      const last = Date.parse(String(data[data.length - 1].t));
      if (!Number.isFinite(last)) break;
      cursor = new Date(last + 1).toISOString();
    }
    const rows = [...byT.values()].filter((row) => Number.isFinite(row.v)).sort((a, b) => a.t - b.t);
    samplesQueryCache = { fromMs, at: now, rows };
    return rows;
  } catch {
    return fromMem;
  }
}

/** 테이프 날짜 색인으로 필요한 날만 읽는다. 하루는 960분 이하라 날짜당 한 번이면 된다. */
export async function loadSamplesForTapeDates(
  tapes: string[],
  opts?: { reactionFromMs?: number }
): Promise<WashoutSample[]> {
  const unique = [...new Set(tapes.map((tape) => tape.slice(0, 10)).filter(Boolean))];
  if (!unique.length) return [];
  try {
    const admin = createAdminClient();
    const earliest = [...unique].sort()[0];
    const reactionFrom =
      opts?.reactionFromMs ??
      Date.parse(`${earliest}T00:00:00Z`) - 4 * 24 * 60 * 60 * 1000;
    const [pages, reaction] = await Promise.all([
      Promise.all(
        unique.map(async (tape) => {
          const rows: WashoutSample[] = [];
          let cursor: string | null = null;
          for (let n = 0; n < 5; n++) {
            let query = admin
              .from("washout_index_samples")
              .select("t,v,tape_date")
              .eq("tape_date", tape)
              .order("t", { ascending: true })
              .limit(1000);
            if (cursor) query = query.gt("t", cursor);
            const { data, error } = await query;
            if (error || !data?.length) break;
            for (const row of data) {
              const sample = sampleFromRow(row);
              if (sample && !isReactionTape(sample.tape_date)) rows.push(sample);
            }
            if (data.length < 1000) break;
            cursor = String(data[data.length - 1].t);
          }
          return rows;
        })
      ),
      loadReactionMap(admin, reactionFrom),
    ]);
    const byT = new Map<number, WashoutSample>();
    for (const page of pages) {
      for (const row of page) byT.set(row.t, row);
    }
    for (const [t, value] of reaction) {
      const row = byT.get(t);
      if (row) row.reaction = value;
    }
    return [...byT.values()].sort((a, b) => a.t - b.t);
  } catch {
    return [];
  }
}
