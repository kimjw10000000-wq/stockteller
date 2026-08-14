/**
 * Shared SEC EDGAR fetch helpers (User-Agent required by SEC).
 * @see https://www.sec.gov/os/webmaster-faq#code-support
 */

export function secHeaders(): HeadersInit {
  const ua =
    process.env.SEC_USER_AGENT?.trim() || "WhyUpAdmin/1.0 admin@whyup.net";
  return {
    "User-Agent": ua,
    Accept: "application/json,text/html,*/*",
  };
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function accessionToFolder(acc: string): string {
  return acc.replace(/-/g, "");
}

type TickerEntry = { cik_str: number; ticker: string; title: string };

let cikMapPromise: Promise<Map<string, { cik: string; title: string }>> | null = null;

async function loadCikMap(): Promise<Map<string, { cik: string; title: string }>> {
  if (cikMapPromise) return cikMapPromise;
  cikMapPromise = (async () => {
    const res = await secFetch("https://www.sec.gov/files/company_tickers.json");
    if (!res.ok) throw new Error(`SEC company_tickers ${res.status}`);
    const raw = (await res.json()) as Record<string, TickerEntry>;
    const map = new Map<string, { cik: string; title: string }>();
    for (const row of Object.values(raw)) {
      if (!row?.ticker) continue;
      const t = String(row.ticker).toUpperCase();
      map.set(t, {
        cik: String(row.cik_str).padStart(10, "0"),
        title: String(row.title ?? "").trim(),
      });
    }
    return map;
  })();
  return cikMapPromise;
}

export async function resolveTickerMeta(
  ticker: string
): Promise<{ cikPadded: string; title: string } | null> {
  const t = ticker.trim().toUpperCase();
  if (!/^[A-Z.\-]{1,10}$/.test(t)) return null;
  const map = await loadCikMap();
  const direct = map.get(t);
  if (direct) return { cikPadded: direct.cik, title: direct.title };
  const br = map.get(t.replace(/\./g, "-"));
  if (br) return { cikPadded: br.cik, title: br.title };
  return null;
}

export async function resolveCikPadded(ticker: string): Promise<string | null> {
  const meta = await resolveTickerMeta(ticker);
  return meta?.cikPadded ?? null;
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** SEC fair-access: max 10 requests/second. Serialize starts ~110ms apart. */
const SEC_MIN_GAP_MS = 110;
let secSlotChain: Promise<void> = Promise.resolve();
let secNextAt = 0;

function waitSecSlot(): Promise<void> {
  const run = secSlotChain.then(async () => {
    const now = Date.now();
    const wait = Math.max(0, secNextAt - now);
    secNextAt = Math.max(now, secNextAt) + SEC_MIN_GAP_MS;
    if (wait > 0) await sleep(wait);
  });
  secSlotChain = run.catch(() => undefined);
  return run;
}

export async function secFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = {
    ...secHeaders(),
    ...(init?.headers as Record<string, string> | undefined),
  };
  for (let attempt = 0; attempt < 4; attempt++) {
    await waitSecSlot();
    const res = await fetch(url, { ...init, headers, cache: "no-store" });
    if (res.status !== 429 && res.status !== 503) return res;
    await sleep(600 * (attempt + 1));
    secNextAt = Date.now() + 500;
  }
  return fetch(url, { ...init, headers, cache: "no-store" });
}
