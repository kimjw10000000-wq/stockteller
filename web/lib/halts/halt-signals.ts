/**
 * 나스닥 상장 변동성 정지는 LULD 17(정지)·18(재개).
 * NYSE·AMEX와 뉴스 정지는 호가 조건·지표. 17·18은 호가에 없다.
 */

export type HaltKind = "volatility" | "news";

export type HaltSignal = {
  ticker: string;
  action: "halt" | "resume";
  at: number;
  market: string;
  kind: HaltKind;
};

const VOLATILITY_CONDITIONS = new Set([43]);
const NEWS_CONDITIONS = new Set([26, 27]);
const RESUME_CONDITIONS = new Set([16]);

const VOLATILITY_INDICATORS = new Set([117, 153, 165]);
const NEWS_INDICATORS = new Set([102, 151, 156]);
const RESUME_INDICATORS = new Set([103, 116]);

function listingKey(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\./g, "-");
}

function marketOf(tape: unknown): string {
  if (tape === 1) return "NYSE";
  if (tape === 2) return "AMEX";
  if (tape === 3) return "Nasdaq";
  return "";
}

/** Polygon `t` 는 밀리초이거나 나노초다. */
export function polygonEventMs(t: unknown, fallback: number): number {
  const n = typeof t === "number" ? t : Number(t);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  if (n > 1e18) return Math.floor(n / 1e6);
  if (n > 1e15) return Math.floor(n / 1e3);
  if (n > 1e12) return Math.floor(n);
  return Math.floor(n * 1000);
}

function nums(value: unknown): number[] {
  if (Array.isArray(value)) return value.map((item) => Number(item)).filter((n) => Number.isFinite(n));
  if (typeof value === "number" && Number.isFinite(value)) return [value];
  return [];
}

function has(codes: number[], set: Set<number>): boolean {
  return codes.some((code) => set.has(code));
}

export function signalFromLuld(msg: {
  T?: string;
  i?: unknown;
  z?: unknown;
  t?: unknown;
}, now = Date.now()): HaltSignal | null {
  const ticker = listingKey(String(msg.T ?? ""));
  if (!ticker) return null;
  const codes = nums(msg.i);
  const at = polygonEventMs(msg.t, now);
  const market = marketOf(msg.z);
  if (codes.includes(18)) return { ticker, action: "resume", at, market, kind: "volatility" };
  if (codes.includes(17)) return { ticker, action: "halt", at, market, kind: "volatility" };
  return null;
}

export function signalFromQuote(msg: {
  sym?: string;
  c?: unknown;
  i?: unknown;
  z?: unknown;
  t?: unknown;
}, now = Date.now()): HaltSignal | null {
  const ticker = listingKey(String(msg.sym ?? ""));
  if (!ticker) return null;
  const condition = Number(msg.c);
  const codes = nums(msg.i);
  const at = polygonEventMs(msg.t, now);
  const market = marketOf(msg.z);
  if ((Number.isFinite(condition) && RESUME_CONDITIONS.has(condition)) || has(codes, RESUME_INDICATORS)) {
    return { ticker, action: "resume", at, market, kind: "volatility" };
  }
  if ((Number.isFinite(condition) && VOLATILITY_CONDITIONS.has(condition)) || has(codes, VOLATILITY_INDICATORS)) {
    return { ticker, action: "halt", at, market, kind: "volatility" };
  }
  if ((Number.isFinite(condition) && NEWS_CONDITIONS.has(condition)) || has(codes, NEWS_INDICATORS)) {
    return { ticker, action: "halt", at, market, kind: "news" };
  }
  return null;
}
