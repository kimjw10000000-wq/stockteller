/**
 * 맥에서 추적 중 종목의 체결만 받아, 1초마다 전고 돌파 확률 파일을 갱신한다.
 * 사이트는 그 파일만 읽는다. Polygon은 여기로만 온다.
 */
import WebSocket from "ws";
import { createAdminClient } from "../supabase/admin";
import { quoteReclaim } from "./reclaim-odds";
import { polygonAdvancedKeyOrNull } from "./polygon-keys";
import { savePublishedReclaimOdds, type PublishedReclaimOdds } from "./washout-published";
import { nameInThisSession, type WashoutBoardRow } from "./washout-live";

const SOCKET = "wss://socket.polygon.io/stocks";

type Seed = {
  ticker: string;
  peak: number;
  low: number;
  price: number;
  prevClose: number;
};

const names = new Map<string, string>();
const book = new Map<string, Seed>();
let socket: WebSocket | null = null;
let authed = false;
let subscribed = "";
let dirty = false;
let publishing = false;
let seeding = false;
const pendingTrades: Array<{ ticker: string; price: number }> = [];
let started = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function listingKey(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\./g, "-");
}

async function rememberNames(tickers: string[]): Promise<void> {
  const missing = tickers.filter((ticker) => !names.has(ticker));
  if (!missing.length) return;
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("us_listed_companies").select("ticker,name").in("ticker", missing);
    for (const row of data ?? []) {
      const ticker = listingKey(String(row.ticker ?? ""));
      const name = String(row.name ?? "").trim();
      if (ticker && name) names.set(ticker, name);
    }
  } catch {
    /* 이름이 없으면 티커만 보여 준다. */
  }
  for (const ticker of missing) if (!names.has(ticker)) names.set(ticker, ticker);
}

function writeTrade(ticker: string, price: number): void {
  const row = book.get(listingKey(ticker));
  if (!row || !(price > 0)) return;
  if (price >= row.peak) {
    row.peak = price;
    row.low = price;
  } else if (price < row.low) {
    row.low = price;
  }
  row.price = price;
  dirty = true;
}

function applyTrade(ticker: string, price: number): void {
  if (!(price > 0)) return;
  if (seeding) {
    pendingTrades.push({ ticker, price });
    return;
  }
  writeTrade(ticker, price);
}

function flushPendingTrades(): void {
  const batch = pendingTrades.splice(0, pendingTrades.length);
  for (const trade of batch) writeTrade(trade.ticker, trade.price);
}

function send(payload: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function syncSubscription(): void {
  if (!authed) return;
  const next = [...book.keys()].sort().map((ticker) => `T.${ticker}`).join(",");
  if (next === subscribed) return;
  if (subscribed) send({ action: "unsubscribe", params: subscribed });
  if (next) send({ action: "subscribe", params: next });
  subscribed = next;
  dirty = true;
}

function onMessage(raw: WebSocket.RawData): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString());
  } catch {
    return;
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  for (const msg of list) {
    if (!msg || typeof msg !== "object") continue;
    const row = msg as { ev?: string; status?: string; sym?: string; p?: number };
    if (row.ev === "status" && row.status === "auth_success") {
      authed = true;
      subscribed = "";
      syncSubscription();
      continue;
    }
    if (row.ev === "T" && row.sym && row.p != null) applyTrade(row.sym, row.p);
  }
}

function connect(): void {
  const key = polygonAdvancedKeyOrNull();
  if (!key || socket) return;
  const ws = new WebSocket(SOCKET);
  socket = ws;
  ws.on("open", () => {
    authed = false;
    send({ action: "auth", params: key });
  });
  ws.on("message", onMessage);
  ws.on("close", () => {
    if (socket === ws) socket = null;
    authed = false;
    subscribed = "";
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 2_000);
  });
  ws.on("error", () => {
    ws.close();
  });
}

async function publish(): Promise<void> {
  const cards: PublishedReclaimOdds["cards"] = [];
  for (const row of book.values()) {
    const quote = quoteReclaim(row);
    if (!quote) continue;
    cards.push({
      ticker: row.ticker,
      name: names.get(row.ticker) ?? row.ticker,
      reclaimPct: quote.reclaimPct,
      nextPct: quote.nextPct,
      nextEdge: quote.nextEdge,
    });
  }
  cards.sort((a, b) => a.ticker.localeCompare(b.ticker));
  await savePublishedReclaimOdds({ builtAt: new Date().toISOString(), cards });
}

function pump(): void {
  if (!dirty || publishing) return;
  dirty = false;
  publishing = true;
  void publish()
    .catch((e) => {
      dirty = true;
      console.error("reclaim odds", e instanceof Error ? e.message : e);
    })
    .finally(() => {
      publishing = false;
    });
}

export function noteReclaimSeeds(items: WashoutBoardRow[], now = Date.now()): void {
  seeding = true;
  try {
    const next = new Map<string, Seed>();
    for (const row of items) {
      if (!nameInThisSession(row.sessionCaptureAt, now)) continue;
      if (!(row.peakPrice && row.peakPrice > 0) || !(row.prevClose && row.prevClose > 0)) continue;
      const price = row.lastPrice && row.lastPrice > 0 ? row.lastPrice : row.peakPrice;
      let low = row.lowSincePeak && row.lowSincePeak > 0 ? Math.min(row.lowSincePeak, price, row.peakPrice) : Math.min(price, row.peakPrice);
      let peak = row.peakPrice;
      let shown = price;
      const prev = book.get(row.ticker);
      if (prev && prev.prevClose === row.prevClose) {
        if (prev.peak > peak) {
          peak = prev.peak;
          low = prev.low;
          shown = prev.price;
        } else if (prev.peak === peak) {
          low = Math.min(prev.low, low);
        }
      }
      next.set(row.ticker, { ticker: row.ticker, peak, low, price: shown, prevClose: row.prevClose });
    }
    if (next.size === 0 && book.size === 0) return;
    book.clear();
    for (const [ticker, row] of next) book.set(ticker, row);
    dirty = true;
    void rememberNames([...book.keys()]);
    syncSubscription();
  } finally {
    seeding = false;
    flushPendingTrades();
  }
}

export function startReclaimOddsFeed(): void {
  if (started) return;
  started = true;
  connect();
  setInterval(pump, 1_000);
}
