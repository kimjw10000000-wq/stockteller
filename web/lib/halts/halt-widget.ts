import { peekKoreanShareName } from "@/lib/companies/korean-names-client";
import { haltCardFace, mergeHaltCards, type HaltCard, type LiveHaltCard } from "./halt-board";
import type { TradeHaltItem } from "./nasdaq-trade-halts";

export function haltCompanyName(card: { ticker: string; name: string; nameKo?: string }, locale: string): string {
  if (locale === "ko") {
    const filed = peekKoreanShareName(card.ticker).trim();
    if (filed) return filed;
    const baked = card.nameKo?.trim();
    if (baked) return baked;
  }
  return card.name?.trim() || card.ticker;
}

export type HaltWidgetMode = "off" | "document" | "video" | "panel";

type WidgetState = {
  live: LiveHaltCard[] | null;
  rss: TradeHaltItem[];
  mode: HaltWidgetMode;
  ticker: string | null;
};

const INITIAL: WidgetState = { live: null, rss: [], mode: "off", ticker: null };
let state: WidgetState = INITIAL;
const listeners = new Set<() => void>();

export function getHaltWidgetState(): WidgetState {
  return state;
}

export function patchHaltWidget(partial: Partial<WidgetState>): void {
  state = { ...state, ...partial };
  for (const listener of listeners) listener();
}

export function subscribeHaltWidget(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let watchers = 0;
const watchListeners = new Set<() => void>();

export function haltWatchers(): number {
  return watchers;
}

export function watchHaltCards(): () => void {
  watchers += 1;
  for (const listener of watchListeners) listener();
  return () => {
    watchers = Math.max(0, watchers - 1);
    for (const listener of watchListeners) listener();
  };
}

export function subscribeHaltWatchers(listener: () => void): () => void {
  watchListeners.add(listener);
  return () => watchListeners.delete(listener);
}

let openImpl: (() => void) | null = null;
let closeImpl: (() => void) | null = null;
let primeImpl: (() => void) | null = null;

export function bindHaltWidgetControls(api: { open: () => void; close: () => void; prime: () => void }): () => void {
  openImpl = api.open;
  closeImpl = api.close;
  primeImpl = api.prime;
  return () => {
    if (openImpl === api.open) openImpl = null;
    if (closeImpl === api.close) closeImpl = null;
    if (primeImpl === api.prime) primeImpl = null;
  };
}

export function primeHaltWidget(): void {
  primeImpl?.();
}

export function openHaltWidget(ticker: string): void {
  const next = ticker.trim().toUpperCase();
  if (!next) return;
  patchHaltWidget({ ticker: next });
  if (getHaltWidgetState().mode === "off") openImpl?.();
}

export function closeHaltWidget(): void {
  closeImpl?.();
}

export function haltCardsAt(now = Date.now()): HaltCard[] | null {
  if (state.live == null && state.rss.length === 0) return state.live;
  return mergeHaltCards(state.live ?? [], state.rss, now);
}

export function focusedHaltCard(now = Date.now()): HaltCard | null {
  const ticker = state.ticker;
  const cards = haltCardsAt(now);
  if (!ticker || !cards) return null;
  return cards.find((row) => row.ticker === ticker) ?? null;
}

export function rankHaltCards(cards: HaltCard[], query: string, locale = "en"): { cards: HaltCard[]; matched: Set<string> } {
  const q = query.trim().toLowerCase();
  if (!q) return { cards, matched: new Set() };
  const score = (row: HaltCard) => {
    const fields = [row.ticker, haltCompanyName(row, locale), row.name, row.nameKo ?? ""].map((field) => field.toLowerCase());
    if (fields.some((field) => field === q)) return 0;
    if (row.ticker.toLowerCase().startsWith(q)) return 1;
    if (fields.some((field) => field.includes(q))) return 2;
    return 3;
  };
  const ranked = cards.map((row, index) => ({ row, score: score(row), index }));
  ranked.sort((a, b) => a.score - b.score || a.index - b.index);
  return {
    cards: ranked.map((item) => item.row),
    matched: new Set(ranked.filter((item) => item.score < 3).map((item) => item.row.ticker)),
  };
}

export const HALT_PIP_W = 640;
export const HALT_PIP_H = 400;
const FONT = '"Apple SD Gothic Neo", "Noto Sans KR", "Noto Sans CJK KR", "Malgun Gothic", sans-serif';

export type HaltWidgetCopy = {
  title: string;
  until: string;
  resumed: string;
  unknown: string;
  waiting: string;
  empty: string;
};

export function paintHaltWidget(
  ctx: CanvasRenderingContext2D,
  card: HaltCard | null,
  copy: HaltWidgetCopy,
  now: number,
  locale = "en",
): void {
  const width = HALT_PIP_W;
  const height = HALT_PIP_H;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#171717";
  ctx.font = `600 28px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(copy.title, 36, 36);
  if (!card) {
    ctx.font = `500 32px ${FONT}`;
    ctx.fillText(copy.empty, 36, 160);
    return;
  }
  const face = haltCardFace(card, now);
  ctx.font = `600 42px ${FONT}`;
  ctx.fillText(card.ticker, 36, 110);
  ctx.font = `500 24px ${FONT}`;
  ctx.fillStyle = "#525252";
  const name = haltCompanyName(card, locale);
  ctx.fillText(name, 36, 168);
  ctx.textAlign = "center";
  if (face.resumed) {
    ctx.fillStyle = "#15803d";
    ctx.font = `700 120px ${FONT}`;
    ctx.fillText(copy.resumed, width / 2, 230);
    return;
  }
  ctx.fillStyle = "#171717";
  ctx.font = `500 28px ${FONT}`;
  ctx.fillText(face.timed ? copy.until : copy.waiting, width / 2, 230);
  ctx.font = `700 120px ${FONT}`;
  ctx.fillText(face.timed ? face.countdown : copy.unknown, width / 2, 280);
}

export function haltWidgetBodyHtml(card: HaltCard | null, copy: HaltWidgetCopy, now: number, locale = "en"): string {
  if (!card) {
    return `<p style="margin:24px;font:600 28px ${FONT}">${copy.empty}</p>`;
  }
  const face = haltCardFace(card, now);
  const name = haltCompanyName(card, locale);
  const clock = face.resumed
    ? `<p style="margin:28px 0 0;text-align:center;font:700 96px ${FONT};color:#15803d">${copy.resumed}</p>`
    : face.timed
      ? `<p style="margin:20px 0 0;text-align:center;font:500 22px ${FONT};color:#525252">${copy.until}</p><p style="margin:8px 0 0;text-align:center;font:700 112px ${FONT}">${face.countdown}</p>`
      : `<p style="margin:20px 0 0;text-align:center;font:500 22px ${FONT};color:#525252">${copy.waiting}</p><p style="margin:8px 0 0;text-align:center;font:700 72px ${FONT}">${copy.unknown}</p>`;
  return `<div style="padding:28px 32px;font-family:${FONT};color:#171717"><p style="margin:0;font:600 22px ${FONT}">${copy.title}</p><p style="margin:28px 0 0;font:700 40px ${FONT}">${card.ticker}</p><p style="margin:8px 0 0;font:500 20px ${FONT};color:#525252">${name}</p>${clock}</div>`;
}
