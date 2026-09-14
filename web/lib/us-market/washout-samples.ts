import { createAdminClient } from "@/lib/supabase/admin";
import { runnerTapeDate, tapeDayElapsedMin } from "./us-session";

export type WashoutSample = {
  t: number;
  v: number;
  tape_date: string;
};

const mem = new Map<number, WashoutSample>();

function minuteKey(t: number): number {
  return Math.floor(t / 60_000) * 60_000;
}

export function rememberSamples(points: Array<{ t: number; v: number }>, tapeDate: string): void {
  for (const point of points) {
    const t = minuteKey(point.t);
    mem.set(t, { t, v: point.v, tape_date: runnerTapeDate(new Date(point.t)) || tapeDate });
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

export async function persistSamples(
  points: Array<{ t: number; v: number }>,
  tapeDate: string,
  opts?: { incremental?: boolean }
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
  const byMinute = new Map<number, { t: number; v: number }>();
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
    const chunk = 400;
    for (let i = 0; i < rows.length; i += chunk) {
      const { error } = await admin.from("washout_index_samples").upsert(rows.slice(i, i + chunk), {
        onConflict: "t",
      });
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

const KEEP_MINUTE_MS = 14 * 24 * 60 * 60 * 1000;
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

export async function loadTrackedTickers(): Promise<string[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("washout_tracked_tickers").select("ticker");
    if (error || !data) return [];
    return data
      .map((row) => String(row.ticker ?? "").trim().toUpperCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function persistTrackedTickers(tickers: string[]): Promise<void> {
  await persistTrackedBoard(tickers.map((ticker) => ({ ticker })));
}

export async function persistTrackedBoard(
  rows: Array<{
    ticker: string;
    score?: number;
    ddPct?: number;
    sessionElapsedMin?: number;
    sessionQuotaMin?: number;
  }>
): Promise<void> {
  try {
    const admin = createAdminClient();
    const uniq = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const ticker = row.ticker.trim().toUpperCase();
      if (ticker) uniq.set(ticker, { ...row, ticker });
    }
    const { error: delErr } = await admin.from("washout_tracked_tickers").delete().neq("ticker", "");
    if (delErr) throw delErr;
    if (uniq.size === 0) return;
    const payload = [...uniq.values()].map((row) => ({
      ticker: row.ticker,
      score: row.score ?? null,
      dd_pct: row.ddPct ?? null,
      session_elapsed_min: row.sessionElapsedMin ?? null,
      session_quota_min: row.sessionQuotaMin ?? null,
    }));
    const { error } = await admin.from("washout_tracked_tickers").upsert(payload, {
      onConflict: "ticker",
    });
    if (error) {
      const { error: plainErr } = await admin.from("washout_tracked_tickers").upsert(
        payload.map((row) => ({ ticker: row.ticker })),
        { onConflict: "ticker" }
      );
      if (plainErr) throw plainErr;
    }
  } catch {
    /* 테이블이 아직 없으면 메모리만 유지 */
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
    let offset = 0;
    for (let n = 0; n < 400; n++) {
      const { data, error } = await admin
        .from("washout_index_samples")
        .select("t,v,tape_date")
        .gte("t", new Date(fromMs).toISOString())
        .order("t", { ascending: true })
        .range(offset, offset + page - 1);
      if (error || !data) break;
      for (const row of data) {
        const t = Date.parse(String(row.t));
        if (!Number.isFinite(t)) continue;
        byT.set(minuteKey(t), {
          t: minuteKey(t),
          v: Number(row.v),
          tape_date: String(row.tape_date),
        });
      }
      offset += data.length;
      if (data.length < page) break;
    }
    const rows = [...byT.values()].sort((a, b) => a.t - b.t);
    samplesQueryCache = { fromMs, at: now, rows };
    return rows;
  } catch {
    return fromMem;
  }
}
