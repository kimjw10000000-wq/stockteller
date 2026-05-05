import WebSocket from "ws";
import { detectUsaScreener } from "./screener-us";
import { createReconnectingWs } from "./reconnecting-ws";
import type { StockData } from "./types";
import { upsertHighVolatilityThrottled } from "./persist";

type Trade = { s: string; p: number; t: number; v: number };

type SymbolState = {
  prevClose: number;
  cumVolume: number;
  lastPrice: number;
  lastTradeMs: number;
};

const FINNHUB_WS = "wss://ws.finnhub.io";
const QUOTE_URL = "https://finnhub.io/api/v1/quote";

async function fetchPrevClose(token: string, symbol: string): Promise<number> {
  const u = new URL(QUOTE_URL);
  u.searchParams.set("symbol", symbol);
  u.searchParams.set("token", token);
  const res = await fetch(u);
  if (!res.ok) throw new Error(`Finnhub quote ${res.status}`);
  const j = (await res.json()) as { pc?: number; c?: number };
  if (typeof j.pc === "number" && j.pc > 0) return j.pc;
  if (typeof j.c === "number" && j.c > 0) return j.c;
  throw new Error(`No prev close for ${symbol}`);
}

export type FinnhubUsOptions = {
  symbols: string[];
  onHotStock?: (row: StockData) => void;
  thresholdPct?: number;
  /** 동일 티커 Supabase upsert 최소 간격 */
  upsertMinMs?: number;
  refreshPrevCloseMs?: number;
};

/**
 * Finnhub WebSocket — Cboe BZX 등 US 트레이드 스트림 (플랜/심볼에 따름).
 * 전일 종가는 REST quote의 pc 필드로 주기적 갱신.
 */
export function startFinnhubUsEngine(opts: FinnhubUsOptions) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    console.warn("[finnhub] FINNHUB_API_KEY 없음 — 미국 스트림 비활성");
    return { stop: () => {} };
  }
  const finnhubApiKey: string = apiKey;

  const symbols = opts.symbols.map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (symbols.length === 0) {
    console.warn("[finnhub] 구독 심볼 없음");
    return { stop: () => {} };
  }

  const state = new Map<string, SymbolState>();
  const threshold = opts.thresholdPct ?? 20;
  const upsertMin = opts.upsertMinMs ?? 15_000;

  async function ensureState(sym: string) {
    if (state.has(sym)) return;
    const pc = await fetchPrevClose(finnhubApiKey, sym);
    state.set(sym, {
      prevClose: pc,
      cumVolume: 0,
      lastPrice: pc,
      lastTradeMs: Date.now(),
    });
  }

  void (async () => {
    for (const s of symbols) {
      try {
        await ensureState(s);
      } catch (e) {
        console.error("[finnhub] init quote", s, e);
      }
    }
  })();

  const refreshMs = opts.refreshPrevCloseMs ?? 60_000;
  const refreshIv = setInterval(() => {
    void (async () => {
      for (const s of symbols) {
        try {
          const pc = await fetchPrevClose(finnhubApiKey, s);
          const st = state.get(s);
          if (st) st.prevClose = pc;
        } catch {
          /* ignore */
        }
      }
    })();
  }, refreshMs);

  const conn = createReconnectingWs({
    label: "finnhub",
    createSocket: () => new WebSocket(`${FINNHUB_WS}?token=${encodeURIComponent(finnhubApiKey)}`),
    onOpen: (ws) => {
      for (const s of symbols) {
        ws.send(JSON.stringify({ type: "subscribe", symbol: s }));
      }
    },
    onMessage: async (raw) => {
      let msg: { type?: string; data?: Trade[] };
      try {
        msg = JSON.parse(raw) as { type?: string; data?: Trade[] };
      } catch {
        return;
      }
      if (msg.type === "ping") {
        conn.getSocket()?.send(JSON.stringify({ type: "pong" }));
        return;
      }
      if (msg.type !== "trade" || !Array.isArray(msg.data)) return;

      for (const t of msg.data) {
        const sym = String(t.s || "").toUpperCase();
        if (!sym) continue;
        await ensureState(sym).catch(() => {});
        const st = state.get(sym);
        if (!st) continue;

        st.lastPrice = t.p;
        st.cumVolume += t.v ?? 0;
        st.lastTradeMs = t.t ?? Date.now();

        const hit = detectUsaScreener({
          ticker: sym,
          lastPrice: st.lastPrice,
          prevClose: st.prevClose,
          volume: st.cumVolume,
          thresholdPct: threshold,
        });
        if (!hit) continue;

        const row: StockData = {
          market: "US",
          ticker: hit.ticker,
          currency: "USD",
          lastPrice: hit.price,
          prevClose: st.prevClose,
          changePct: hit.changePct,
          volume: hit.volume,
          timestamp: st.lastTradeMs,
          source: "finnhub",
          raw: t,
        };

        opts.onHotStock?.(row);
        try {
          await upsertHighVolatilityThrottled(row, upsertMin);
        } catch (e) {
          console.error("[finnhub] persist", e);
        }
      }
    },
  });

  conn.start();

  const pingIv = setInterval(() => {
    try {
      conn.getSocket()?.send(JSON.stringify({ type: "ping" }));
    } catch {
      /* ignore */
    }
  }, 45_000);

  return {
    stop: () => {
      clearInterval(refreshIv);
      clearInterval(pingIv);
      conn.stop();
    },
  };
}
