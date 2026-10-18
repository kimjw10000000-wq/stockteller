/**
 * 맥에서 추적 중 종목의 체결만 받아, 1초마다 전고 돌파 확률 파일을 갱신한다.
 * 사이트는 그 파일만 읽는다. Polygon은 여기로만 온다.
 */
import WebSocket from "ws";
import { createAdminClient } from "../supabase/admin";
import { quoteReclaim } from "./reclaim-odds";
import { isTossConfigured } from "../toss/client";
import { fetchTossStocks } from "../toss/stocks";
import { polygonAdvancedKeyOrNull } from "./polygon-keys";
import { savePublishedReclaimOdds, type PublishedReclaimOdds } from "./washout-published";
import { inReclaimHoldGap } from "./us-session";
import { isWarrantOrPreferredListing } from "../companies/listing-diff";
import { nameInThisSession, type WashoutBoardRow } from "./washout-live";

const SOCKET = "wss://socket.polygon.io/stocks";

type Seed = {
  ticker: string;
  peak: number;
  low: number;
  price: number;
  prevClose: number;
  /** 확률에만 쓰는 기준가. 가짜 전일 종가면 시초가. */
  oddsPrev: number;
  /** Polygon과 같은 식. (현재가 / 전일종가 - 1) × 100. 체결마다 갱신. */
  polygonPct: number;
};

const names = new Map<string, string>();
const namesKo = new Map<string, string>();
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
  const missingKo = tickers.filter((ticker) => !namesKo.has(ticker));
  if (!missing.length && !missingKo.length) return;
  if (missing.length) {
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
  if (missingKo.length && isTossConfigured()) {
    try {
      const rows = await fetchTossStocks(missingKo);
      for (const row of rows) {
        const ticker = listingKey(row.symbol);
        const name = row.name.trim();
        if (ticker && name) namesKo.set(ticker, name);
      }
      for (const ticker of missingKo) if (!namesKo.has(ticker)) namesKo.set(ticker, "");
    } catch (e) {
      console.error("toss names", e instanceof Error ? e.message : e);
    }
  }
  dirty = true;
}

function writeTrade(ticker: string, price: number): void {
  if (inReclaimHoldGap()) return;
  const row = book.get(listingKey(ticker));
  if (!row || !(price > 0)) return;
  if (price >= row.peak) {
    row.peak = price;
    row.low = price;
  } else if (price < row.low) {
    row.low = price;
  }
  row.price = price;
  row.polygonPct = polygonPct(price, row.prevClose, row.polygonPct);
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

function polygonPct(price: number, prevClose: number, snapshot?: number | null): number {
  if (prevClose > 0 && price > 0) return (price / prevClose - 1) * 100;
  return snapshot != null && Number.isFinite(snapshot) ? snapshot : 0;
}

function listedLabel(ticker: string): string {
  return [names.get(ticker), namesKo.get(ticker)].filter(Boolean).join(" ");
}

function risePct(row: Seed): number {
  return polygonPct(row.price, row.prevClose, row.polygonPct);
}

async function publish(): Promise<void> {
  const ranked = [...book.values()].sort((a, b) => {
    const diff = risePct(b) - risePct(a);
    if (diff !== 0) return diff;
    return a.ticker.localeCompare(b.ticker);
  });
  const cards: PublishedReclaimOdds["cards"] = [];
  for (const row of ranked) {
    const quote = quoteReclaim({
      prevClose: row.oddsPrev,
      peak: row.peak,
      low: row.low,
      price: row.price,
    });
    if (!quote) continue;
    if (isWarrantOrPreferredListing(row.ticker, listedLabel(row.ticker))) continue;
    cards.push({
      ticker: row.ticker,
      name: names.get(row.ticker) ?? row.ticker,
      ...(namesKo.get(row.ticker) ? { nameKo: namesKo.get(row.ticker) } : {}),
      reclaimPct: quote.reclaimPct,
      nextPct: quote.nextPct,
      nextEdge: quote.nextEdge,
      risePct: risePct(row),
    });
  }
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
  // 20:00을 넘긴 뒤에 19:59 명단을 다시 심으면 세션이 비어 카드가 전부 지워진다.
  if (inReclaimHoldGap(new Date(now))) return;
  seeding = true;
  try {
    const next = new Map<string, Seed>();
    for (const row of items) {
      if (!nameInThisSession(row.sessionCaptureAt, now)) continue;
      if (isWarrantOrPreferredListing(row.ticker, listedLabel(row.ticker))) continue;
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
      const oddsPrev = row.oddsPrevClose && row.oddsPrevClose > 0 ? row.oddsPrevClose : row.prevClose;
      next.set(row.ticker, {
        ticker: row.ticker,
        peak,
        low,
        price: shown,
        prevClose: row.prevClose,
        oddsPrev,
        polygonPct: polygonPct(shown, row.prevClose, row.todaysChangePerc),
      });
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
