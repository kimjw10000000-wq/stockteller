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
const SAMPLES_CACHE_MS = 30_000;

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
  const fresh = incremental && lastPersistedT > 0
    ? points.filter((p) => minuteKey(p.t) > lastPersistedT)
    : points;
  if (fresh.length === 0) return;
  try {
    const admin = createAdminClient();
    const rows = fresh.map((point) => ({
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
    lastPersistedT = Math.max(lastPersistedT, ...fresh.map((p) => minuteKey(p.t)));
    samplesQueryCache = null;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[washout] persistSamples failed", message);
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
  try {
    const admin = createAdminClient();
    const uniq = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))];
    const { error: delErr } = await admin.from("washout_tracked_tickers").delete().neq("ticker", "");
    if (delErr) throw delErr;
    if (uniq.length === 0) return;
    const { error } = await admin.from("washout_tracked_tickers").upsert(
      uniq.map((ticker) => ({ ticker })),
      { onConflict: "ticker" }
    );
    if (error) throw error;
  } catch {
    /* 테이블이 아직 없으면 메모리만 유지 */
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
