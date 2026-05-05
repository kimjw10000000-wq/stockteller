import type { StockData } from "./types";
import { upsertHighVolatilityThrottled } from "./persist";

const DEFAULT_BASE = "https://api.jpx-jquants.com/v1";

type AuthUserRes = {
  idToken?: string;
  refreshToken?: string;
};

type DailyBar = {
  Date?: string;
  Close?: number;
  Volume?: number;
};

type DailyBarsRes = {
  daily_quotes?: DailyBar[];
};

export class JQuantsClient {
  private idToken: string | null = null;
  private refreshToken: string | null = null;

  constructor(private readonly baseUrl: string) {}

  static fromEnv(): JQuantsClient {
    const base = process.env.JQUANTS_API_BASE || DEFAULT_BASE;
    return new JQuantsClient(base.replace(/\/$/, ""));
  }

  async authWithPassword(mail: string, password: string): Promise<void> {
    const url = `${this.baseUrl}/token/auth_user`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mailaddress: mail, password }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`J-Quants auth_user ${res.status}: ${text.slice(0, 200)}`);
    const j = JSON.parse(text) as AuthUserRes;
    if (!j.idToken || !j.refreshToken) throw new Error("J-Quants: missing tokens");
    this.idToken = j.idToken;
    this.refreshToken = j.refreshToken;
  }

  async refresh(): Promise<void> {
    if (!this.refreshToken) throw new Error("J-Quants: no refresh token");
    const url = `${this.baseUrl}/token/auth_refresh?refreshtoken=${encodeURIComponent(this.refreshToken)}`;
    const res = await fetch(url, { method: "POST" });
    const text = await res.text();
    if (!res.ok) throw new Error(`J-Quants refresh ${res.status}: ${text.slice(0, 200)}`);
    const j = JSON.parse(text) as AuthUserRes;
    if (!j.idToken) throw new Error("J-Quants: refresh missing idToken");
    this.idToken = j.idToken;
    if (j.refreshToken) this.refreshToken = j.refreshToken;
  }

  private async authHeader(): Promise<Record<string, string>> {
    if (!this.idToken) throw new Error("J-Quants: not authenticated");
    return { Authorization: `Bearer ${this.idToken}` };
  }

  /** 일봉으로 전일·최신 종가 근사 (지연·제한은 J-Quants 플랜 따름) */
  async fetchLastTwoCloses(code: string, authRetries = 0): Promise<{ prev: number; last: number; vol: number; lastDate: string } | null> {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 14);
    const to = end.toISOString().slice(0, 10).replace(/-/g, "");
    const from = start.toISOString().slice(0, 10).replace(/-/g, "");

    const u = new URL(`${this.baseUrl}/equities/bars/daily`);
    u.searchParams.set("code", code);
    u.searchParams.set("from", from);
    u.searchParams.set("to", to);

    const headers = await this.authHeader();
    const res = await fetch(u, { headers });
    const text = await res.text();
    if (res.status === 401 && authRetries < 2) {
      await this.refresh();
      return this.fetchLastTwoCloses(code, authRetries + 1);
    }
    if (!res.ok) {
      console.warn("[jquants] bars", code, res.status, text.slice(0, 120));
      return null;
    }
    const j = JSON.parse(text) as DailyBarsRes;
    const bars = j.daily_quotes?.filter((b) => typeof b.Close === "number") ?? [];
    if (bars.length < 2) return null;
    const last = bars[bars.length - 1]!;
    const prev = bars[bars.length - 2]!;
    const prevClose = prev.Close!;
    const lastClose = last.Close!;
    const vol = typeof last.Volume === "number" ? last.Volume : 0;
    return {
      prev: prevClose,
      last: lastClose,
      vol,
      lastDate: last.Date ?? "",
    };
  }

  isAuthed(): boolean {
    return this.idToken != null;
  }
}

export type JQuantsPollOptions = {
  codes: string[];
  intervalMs?: number;
  thresholdPct?: number;
  upsertMinMs?: number;
  onHot?: (row: StockData) => void;
};

export function startJQuantsPollLoop(opts: JQuantsPollOptions): { stop: () => void } {
  const mail = process.env.JQUANTS_MAIL?.trim();
  const pass = process.env.JQUANTS_PASSWORD?.trim();
  if (!mail || !pass) {
    console.warn("[jquants] JQUANTS_MAIL / JQUANTS_PASSWORD 없음 — 일본 폴링 비활성");
    return { stop: () => {} };
  }

  const client = JQuantsClient.fromEnv();
  const codes = opts.codes.map((c) => c.trim()).filter(Boolean);
  if (codes.length === 0) {
    console.warn("[jquants] 종목 코드 없음");
    return { stop: () => {} };
  }

  const interval = opts.intervalMs ?? Number(process.env.ENGINE_JP_POLL_MS || 30_000);
  const threshold = opts.thresholdPct ?? Number(process.env.ENGINE_JP_THRESHOLD_PCT || 15);
  const upsertMin = opts.upsertMinMs ?? 15_000;
  let stopped = false;

  const tick = async () => {
    if (!client.isAuthed()) {
      try {
        await client.authWithPassword(mail, pass);
      } catch (e) {
        console.error("[jquants] auth", e);
        return;
      }
    }
    for (const code of codes) {
      try {
        const pair = await client.fetchLastTwoCloses(code);
        if (!pair) continue;
        const { prev, last, vol } = pair;
        if (prev <= 0) continue;
        const changePct = ((last - prev) / prev) * 100;
        if (changePct < threshold) continue;

        const row: StockData = {
          market: "JP",
          ticker: code,
          currency: "JPY",
          lastPrice: last,
          prevClose: prev,
          changePct: Math.round(changePct * 100) / 100,
          volume: vol,
          timestamp: Date.now(),
          source: "jquants",
        };
        opts.onHot?.(row);
        await upsertHighVolatilityThrottled(row, upsertMin);
      } catch (e) {
        console.error("[jquants] tick", code, e);
      }
    }
  };

  void tick();
  const iv = setInterval(() => {
    if (!stopped) void tick();
  }, interval);

  return {
    stop: () => {
      stopped = true;
      clearInterval(iv);
    },
  };
}
