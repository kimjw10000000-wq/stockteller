import WebSocket from "ws";
import { createReconnectingWs } from "./reconnecting-ws";
import type { StockData } from "./types";
import { upsertHighVolatilityThrottled } from "./persist";

const DEFAULT_REST = "https://openapi.koreainvestment.com:9443";
/** 실전 국내 주식 실시간 (공식 문서 기준 — 변경 시 KIS_WS_URL 로 덮어쓰기) */
const DEFAULT_WS_REAL = "ws://ops.koreainvestment.com:21000";
const DEFAULT_WS_PAPER = "ws://ops.koreainvestment.com:31000";

type KisApprovalResponse = { approval_key?: string };

async function fetchApprovalKey(restBase: string, appKey: string, appSecret: string): Promise<string> {
  const url = `${restBase.replace(/\/$/, "")}/oauth2/Approval`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: appKey,
      secretkey: appSecret,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`KIS Approval ${res.status}: ${text.slice(0, 200)}`);
  const j = JSON.parse(text) as KisApprovalResponse;
  if (!j.approval_key) throw new Error("KIS: approval_key missing");
  return j.approval_key;
}

function buildSubscribePayload(approvalKey: string, trKey: string) {
  return JSON.stringify({
    header: {
      approval_key: approvalKey,
      custtype: "P",
      tr_type: "1",
      "content-type": "utf-8",
    },
    body: {
      input: {
        tr_id: "H0STCNT0",
        tr_key: trKey,
      },
    },
  });
}

/**
 * H0STCNT0 등 파이프/캐럿 구분 문자열에서 현재가 추출 시도 (포맷은 증권사 응답 개정 시 깨질 수 있음).
 */
export function tryParseKisTradeLine(line: string): {
  code: string;
  price: number;
  volume: number;
  ts: number;
} | null {
  const s = line.trim();
  if (!s) return null;
  if (s.startsWith("{")) {
    try {
      const j = JSON.parse(s) as Record<string, unknown>;
      const body = j.body as Record<string, unknown> | undefined;
      const out = (body?.output ?? body?.msg1) as string | undefined;
      if (typeof out === "string") return tryParseKisTradeLine(out);
    } catch {
      return null;
    }
  }
  const parts = s.split(/[\^|]/).map((x) => x.trim());
  if (parts.length < 4) return null;
  const code = parts[0]?.replace(/\D/g, "") || parts[1]?.replace(/\D/g, "");
  const price = parseFloat(parts[2] || parts[3] || "NaN");
  const vol = parseFloat(parts[4] || parts[5] || "0");
  if (!code || code.length < 4 || !Number.isFinite(price)) return null;
  return {
    code,
    price,
    volume: Number.isFinite(vol) ? vol : 0,
    ts: Date.now(),
  };
}

export type KisKrOptions = {
  codes: string[];
  /** 전일 종가 (코드 → 가격). 미제공 시 당일 첫 체결가를 전일로 간주하지 않음 → 별도 조회 권장 */
  prevCloseByCode: Record<string, number>;
  thresholdPct?: number;
  upsertMinMs?: number;
  onHot?: (row: StockData) => void;
};

export function startKisKrStream(opts: KisKrOptions): { stop: () => void } {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) {
    console.warn("[kis] KIS_APP_KEY / KIS_APP_SECRET 없음 — 한국 스트림 비활성");
    return { stop: () => {} };
  }
  const kisAppKey: string = appKey;
  const kisAppSecret: string = appSecret;

  const mode = (process.env.KIS_MODE || "real").toLowerCase();
  const wsBase =
    process.env.KIS_WS_URL ||
    (mode === "paper" || mode === "demo" ? DEFAULT_WS_PAPER : DEFAULT_WS_REAL);
  const restBase = process.env.KIS_REST_BASE || DEFAULT_REST;

  const codes = opts.codes.map((c) => c.replace(/\D/g, "")).filter((c) => c.length >= 4);
  if (codes.length === 0) {
    console.warn("[kis] 종목 코드 없음");
    return { stop: () => {} };
  }

  let approvalKey: string | null = null;
  let approvalFetchedAt = 0;
  const APPROVAL_TTL_MS = 20 * 60 * 60 * 1000;

  const threshold = opts.thresholdPct ?? Number(process.env.ENGINE_KR_THRESHOLD_PCT || 15);
  const upsertMin = opts.upsertMinMs ?? 15_000;

  async function ensureApproval(): Promise<string> {
    const now = Date.now();
    if (approvalKey && now - approvalFetchedAt < APPROVAL_TTL_MS) return approvalKey;
    approvalKey = await fetchApprovalKey(restBase, kisAppKey, kisAppSecret);
    approvalFetchedAt = now;
    return approvalKey;
  }

  const conn = createReconnectingWs({
    label: "kis",
    createSocket: () => new WebSocket(wsBase),
    onOpen: async (ws) => {
      try {
        const key = await ensureApproval();
        for (const code of codes) {
          ws.send(buildSubscribePayload(key, code));
        }
      } catch (e) {
        console.error("[kis] subscribe error", e);
      }
    },
    onMessage: async (raw) => {
      const parsed = tryParseKisTradeLine(raw);
      if (!parsed) return;
      const prev = opts.prevCloseByCode[parsed.code];
      if (prev == null || prev <= 0) return;

      const changePct = ((parsed.price - prev) / prev) * 100;
      if (changePct < threshold) return;

      const row: StockData = {
        market: "KR",
        ticker: parsed.code,
        currency: "KRW",
        lastPrice: parsed.price,
        prevClose: prev,
        changePct: Math.round(changePct * 100) / 100,
        volume: parsed.volume,
        timestamp: parsed.ts,
        source: "kis",
        raw: raw.slice(0, 500),
      };
      opts.onHot?.(row);
      try {
        await upsertHighVolatilityThrottled(row, upsertMin);
      } catch (e) {
        console.error("[kis] persist", e);
      }
    },
  });

  conn.start();
  return { stop: () => conn.stop() };
}
