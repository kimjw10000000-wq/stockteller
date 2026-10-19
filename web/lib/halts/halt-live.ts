/**
 * 맥의 상시 프로세스에서 Polygon 소켓을 연다.
 * 나스닥 변동성 정지는 LULD, 그 밖은 호가. 사이트는 이 파일을 읽는다.
 */
import WebSocket from "ws";
import { polygonAdvancedKeyOrNull } from "../us-market/polygon-keys";
import { savePublishedHaltLive, type PublishedHaltLive } from "../us-market/washout-published";
import { RESUMED_KEEP_MS } from "./halt-clock";
import { signalFromLuld, signalFromQuote, type HaltKind, type HaltSignal } from "./halt-signals";

const SOCKET = "wss://socket.polygon.io/stocks";

type Row = {
  ticker: string;
  market: string;
  kind: HaltKind;
  haltedAt: number;
  resumedAt: number | null;
};

const book = new Map<string, Row>();
let dirty = false;
let publishing = false;
let luld: WebSocket | null = null;
let quotes: WebSocket | null = null;
let started = false;

export function haltBookTickers(): string[] {
  return [...book.keys()];
}

export function applyHaltSignal(signal: HaltSignal): void {
  const prev = book.get(signal.ticker);
  if (signal.kind === "news") return;
  if (signal.action === "resume") {
    if (!prev || prev.resumedAt != null) return;
    prev.resumedAt = signal.at;
    if (signal.market) prev.market = signal.market;
    dirty = true;
    return;
  }
  if (prev && prev.resumedAt == null) return;
  book.set(signal.ticker, {
    ticker: signal.ticker,
    market: signal.market || prev?.market || "",
    kind: signal.kind,
    haltedAt: signal.at,
    resumedAt: null,
  });
  dirty = true;
}

function prune(now: number): void {
  for (const [ticker, row] of book) {
    if (row.resumedAt != null && now - row.resumedAt >= RESUMED_KEEP_MS) book.delete(ticker);
  }
}

function snapshot(now = Date.now()): PublishedHaltLive {
  prune(now);
  return {
    builtAt: new Date(now).toISOString(),
    cards: [...book.values()].sort((a, b) => b.haltedAt - a.haltedAt),
  };
}

async function publish(): Promise<void> {
  if (!dirty || publishing) return;
  dirty = false;
  publishing = true;
  try {
    await savePublishedHaltLive(snapshot());
  } catch (e) {
    dirty = true;
    console.error("halt live", e instanceof Error ? e.message : e);
  } finally {
    publishing = false;
  }
}

function onLuld(raw: WebSocket.RawData): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString());
  } catch {
    return;
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  for (const msg of list) {
    if (!msg || typeof msg !== "object") continue;
    const row = msg as { ev?: string; status?: string };
    if (row.ev === "status" && row.status === "auth_success") {
      luld?.send(JSON.stringify({ action: "subscribe", params: "LULD.*" }));
      continue;
    }
    if (row.ev !== "LULD") continue;
    const signal = signalFromLuld(msg as { T?: string; i?: unknown; z?: unknown; t?: unknown });
    if (signal) applyHaltSignal(signal);
  }
}

function onQuote(raw: WebSocket.RawData): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString());
  } catch {
    return;
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  for (const msg of list) {
    if (!msg || typeof msg !== "object") continue;
    const row = msg as { ev?: string; status?: string };
    if (row.ev === "status" && row.status === "auth_success") {
      quotes?.send(JSON.stringify({ action: "subscribe", params: "Q.*" }));
      continue;
    }
    if (row.ev !== "Q") continue;
    const signal = signalFromQuote(msg as { sym?: string; c?: unknown; i?: unknown; z?: unknown; t?: unknown });
    if (signal) applyHaltSignal(signal);
  }
}

function openSocket(onMessage: (raw: WebSocket.RawData) => void, slot: "luld" | "quotes"): void {
  const key = polygonAdvancedKeyOrNull();
  if (!key) return;
  const current = slot === "luld" ? luld : quotes;
  if (current) return;
  const ws = new WebSocket(SOCKET);
  if (slot === "luld") luld = ws;
  else quotes = ws;
  ws.on("open", () => {
    ws.send(JSON.stringify({ action: "auth", params: key }));
  });
  ws.on("message", onMessage);
  ws.on("close", () => {
    if (slot === "luld" && luld === ws) luld = null;
    if (slot === "quotes" && quotes === ws) quotes = null;
    setTimeout(() => openSocket(onMessage, slot), 2_000);
  });
  ws.on("error", () => {
    ws.close();
  });
}

export function startHaltLiveFeed(): void {
  if (started) return;
  started = true;
  if (!polygonAdvancedKeyOrNull()) {
    console.error("halt live skipped: POLYGON_API_KEY_ADVANCED missing");
    return;
  }
  openSocket(onLuld, "luld");
  openSocket(onQuote, "quotes");
  setInterval(() => {
    void publish();
  }, 500);
}
