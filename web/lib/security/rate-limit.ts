/**
 * 인스턴스 메모리 기반 API rate limit.
 * Vercel 서버리스는 인스턴스가 여러 개라 전역 한도는 아닙니다.
 * 트래픽이 커지면 Upstash Redis 등으로 바꾸면 됩니다.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000;
/** 일반 API: IP당 분당 요청 */
const DEFAULT_MAX = 120;
/** 분석·목록 덤프 등 */
const STRICT_MAX = 40;
/** HTML 페이지: 사람 탐색은 충분, 목록 전체 긁기는 막음 */
const PAGE_MAX = 90;

let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < WINDOW_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function maxForPath(pathname: string): number {
  if (
    pathname.startsWith("/api/analyze") ||
    pathname.startsWith("/api/us-mover-insight") ||
    pathname.startsWith("/api/disclosures") ||
    pathname.startsWith("/api/compliance") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/signup") ||
    pathname.startsWith("/api/recover")
  ) {
    return STRICT_MAX;
  }
  return DEFAULT_MAX;
}

/** 브라우저 실시간 폴링 — 제한하면 지표 화면이 깨집니다. */
export function isRateLimitExemptPath(pathname: string): boolean {
  if (pathname.startsWith("/api/cron/")) return true;
  if (pathname.startsWith("/api/news-sec/quotes")) return true;
  if (pathname.startsWith("/api/halts")) return true;
  if (pathname.startsWith("/api/indicators/state")) return true;
  if (pathname.startsWith("/api/indicators/stream")) return true;
  if (pathname.startsWith("/api/auth")) return true;
  return false;
}

export function clientIp(request: {
  headers: { get(name: string): string | null };
}): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function consumeApiRateLimit(
  pathname: string,
  ip: string
): { ok: true } | { ok: false; retryAfterSec: number } {
  const max = maxForPath(pathname);
  return consumeLimit(`${ip}:api:${max}`, max);
}

export function consumePageRateLimit(
  ip: string
): { ok: true } | { ok: false; retryAfterSec: number } {
  return consumeLimit(`${ip}:page`, PAGE_MAX);
}

function consumeLimit(
  key: string,
  max: number
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  sweep(now);
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }
  if (current.count >= max) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { ok: true };
}
