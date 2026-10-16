export type ReclaimCard = {
  ticker: string;
  name: string;
  nameKo?: string;
  reclaimPct: number;
  nextPct: number;
  nextEdge: number | null;
  risePct?: number;
};

export type OddsWidgetCopy = {
  title: string;
  until: string;
  reclaim: string;
  above: string;
  empty: string;
  loading: string;
  next: (edge: number) => string;
};

export type ReclaimWidgetMode = "off" | "document" | "video" | "panel";

type WidgetState = {
  cards: ReclaimCard[] | null;
  mode: ReclaimWidgetMode;
  ticker: string | null;
};

const INITIAL: WidgetState = { cards: null, mode: "off", ticker: null };
let state: WidgetState = INITIAL;
const listeners = new Set<() => void>();

export function getReclaimWidgetState(): WidgetState {
  return state;
}

export function patchReclaimWidget(partial: Partial<WidgetState>): void {
  state = { ...state, ...partial };
  for (const listener of listeners) listener();
}

export function subscribeReclaimWidget(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let watchers = 0;
const watchListeners = new Set<() => void>();

export function reclaimWatchers(): number {
  return watchers;
}

export function watchReclaimOdds(): () => void {
  watchers += 1;
  for (const listener of watchListeners) listener();
  return () => {
    watchers = Math.max(0, watchers - 1);
    for (const listener of watchListeners) listener();
  };
}

export function subscribeReclaimWatchers(listener: () => void): () => void {
  watchListeners.add(listener);
  return () => watchListeners.delete(listener);
}

/** Phones and iPads. Desktop browsers keep the full list. */
export function isHandheldOddsDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPod|iPad|Android/i.test(ua)) return true;
  // iPadOS 13+ sends a desktop Macintosh UA and reports a touch screen.
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1 && /Macintosh/.test(ua);
}

let openImpl: (() => void) | null = null;
let closeImpl: (() => void) | null = null;
let primeImpl: (() => void) | null = null;

export function bindReclaimWidgetControls(api: { open: () => void; close: () => void; prime: () => void }): () => void {
  openImpl = api.open;
  closeImpl = api.close;
  primeImpl = api.prime;
  return () => {
    if (openImpl === api.open) openImpl = null;
    if (closeImpl === api.close) closeImpl = null;
    if (primeImpl === api.prime) primeImpl = null;
  };
}

/** Start the hidden video before Picture-in-Picture. Chrome rejects the first request until a frame exists. */
export function primeReclaimWidget(): void {
  primeImpl?.();
}

export function openReclaimWidget(ticker: string): void {
  if (!isHandheldOddsDevice()) return;
  const next = ticker.trim().toUpperCase();
  if (!next) return;
  patchReclaimWidget({ ticker: next });
  if (getReclaimWidgetState().mode === "off") openImpl?.();
}

export function closeReclaimWidget(): void {
  closeImpl?.();
}

export function focusedReclaimCard(): ReclaimCard | null {
  const { cards, ticker } = state;
  if (!ticker || !cards) return null;
  return cards.find((row) => row.ticker === ticker) ?? null;
}

export function rankReclaimCards(
  cards: ReclaimCard[],
  query: string,
  locale: string,
): { cards: ReclaimCard[]; matched: Set<string> } {
  const q = query.trim().toLowerCase();
  if (!q) return { cards, matched: new Set() };
  const compact = (value: string) => value.toLowerCase().replace(/\s+/g, "");
  const qCompact = compact(q);
  const score = (row: ReclaimCard) => {
    const fields = [row.ticker, cardDisplayName(row, locale), row.name, row.nameKo ?? ""].filter(Boolean);
    const raw = fields.map((field) => field.toLowerCase());
    const tight = raw.map(compact);
    if (raw.some((field) => field === q) || tight.some((field) => field === qCompact)) return 0;
    if (row.ticker.toLowerCase().startsWith(q)) return 1;
    if (raw.some((field) => field.startsWith(q)) || tight.some((field) => field.startsWith(qCompact))) return 2;
    if (raw.some((field) => field.includes(q)) || tight.some((field) => field.includes(qCompact))) return 3;
    return 4;
  };
  const ranked = cards.map((row, index) => ({ row, score: score(row), index }));
  ranked.sort((a, b) => a.score - b.score || a.index - b.index);
  return {
    cards: ranked.map((item) => item.row),
    matched: new Set(ranked.filter((item) => item.score < 4).map((item) => item.row.ticker)),
  };
}

export function pctLabel(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0.1%";
  if (n >= 100) return "100%";
  const v = Math.round(n * 10) / 10;
  if (v <= 0) return "0.1%";
  if (v >= 100) return "100%";
  return Number.isInteger(v) ? `${v}%` : `${v.toFixed(1)}%`;
}

export function cardDisplayName(row: ReclaimCard, locale: string): string {
  const name = locale === "ko" && row.nameKo ? row.nameKo : row.name;
  const trimmed = name?.trim();
  return trimmed || row.ticker;
}

export function sortReclaimCards(cards: ReclaimCard[]): ReclaimCard[] {
  if (cards.every((row) => row.risePct == null)) return cards;
  return [...cards].sort((a, b) => {
    const diff = (b.risePct ?? -Infinity) - (a.risePct ?? -Infinity);
    if (diff !== 0) return diff;
    return a.ticker.localeCompare(b.ticker);
  });
}

export function cardsSignature(cards: ReclaimCard[]): string {
  return cards
    .map((row) =>
      [row.ticker, row.name, row.nameKo ?? "", row.reclaimPct, row.nextPct, row.nextEdge ?? "", row.risePct ?? ""].join(
        "~",
      ),
    )
    .join("|");
}

export const ODDS_PIP_W = 640;
export const ODDS_PIP_H = 400;
const FONT = '"Apple SD Gothic Neo", "Noto Sans KR", "Noto Sans CJK KR", "Malgun Gothic", sans-serif';

function ellipsis(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let next = text;
  while (next.length > 1 && ctx.measureText(`${next}…`).width > maxWidth) next = next.slice(0, -1);
  return `${next}…`;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let rest = text.trim();
  while (rest && lines.length < maxLines) {
    if (ctx.measureText(rest).width <= maxWidth) {
      lines.push(rest);
      rest = "";
      break;
    }
    let cut = rest.length;
    while (cut > 1 && ctx.measureText(rest.slice(0, cut)).width > maxWidth) cut -= 1;
    const space = rest.lastIndexOf(" ", cut);
    if (space > 4) cut = space;
    lines.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest && lines.length > 0) {
    const last = lines.length - 1;
    lines[last] = ellipsis(ctx, `${lines[last]}${rest}`, maxWidth);
  }
  return lines;
}

/** One name fills the small window. */
export function paintOddsWidget(
  ctx: CanvasRenderingContext2D,
  card: ReclaimCard | null,
  copy: OddsWidgetCopy,
  locale: string,
): void {
  const width = ODDS_PIP_W;
  const height = ODDS_PIP_H;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#030213";
  ctx.fillRect(0, 0, width, 8);

  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = "#717182";
  ctx.font = `500 18px ${FONT}`;
  const brandW = ctx.measureText("whyup").width;
  ctx.fillText("whyup", width - 28 - brandW, 24);

  if (!card) {
    ctx.font = `400 28px ${FONT}`;
    ctx.fillText(copy.empty, 28, 96);
    return;
  }

  const inner = width - 56;
  ctx.fillStyle = "#030213";
  ctx.font = `700 46px ${FONT}`;
  const nameLines = wrapLines(ctx, cardDisplayName(card, locale), inner - brandW - 16, 2);
  let y = 28;
  for (const line of nameLines) {
    ctx.fillText(line, 28, y);
    y += 54;
  }

  ctx.fillStyle = "#717182";
  ctx.font = "500 28px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(card.ticker, 28, y + 4);
  y += 48;

  ctx.font = `400 22px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(ellipsis(ctx, copy.until, inner), width / 2, y);
  ctx.textAlign = "left";
  y += 52;

  const nextLabel = card.nextEdge == null ? copy.above : copy.next(card.nextEdge);
  const colW = (inner - 24) / 2;
  ctx.font = `400 22px ${FONT}`;
  ctx.fillStyle = "#717182";
  ctx.fillText(ellipsis(ctx, copy.reclaim, colW), 28, y);
  ctx.textAlign = "right";
  ctx.fillText(ellipsis(ctx, nextLabel, colW), width - 28, y);
  ctx.textAlign = "left";
  y += 36;

  ctx.fillStyle = "#030213";
  ctx.font = `700 72px ${FONT}`;
  ctx.fillText(pctLabel(card.reclaimPct), 28, y);
  ctx.textAlign = "right";
  ctx.fillText(pctLabel(card.nextPct), width - 28, y);
  ctx.textAlign = "left";
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

export const ODDS_PIP_CSS = `
  html, body { height: 100%; margin: 0; background: #fff; color: #030213; }
  body { font-family: "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif; }
  #odds-scroll { box-sizing: border-box; height: 100%; display: flex; align-items: center; padding: 18px 22px; }
  .sheet { width: 100%; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .name { margin: 0; font-size: 28px; line-height: 1.25; font-weight: 700; }
  .brand { font-size: 12px; color: #717182; }
  .ticker { margin: 6px 0 0; font-family: ui-monospace, monospace; font-size: 16px; color: #717182; }
  .until { margin: 14px 0 0; text-align: center; font-size: 13px; line-height: 1.35; color: #717182; }
  .cols { display: flex; justify-content: space-between; gap: 16px; margin-top: 16px; }
  .cols p { margin: 0; }
  .lab { font-size: 13px; line-height: 1.35; color: #717182; }
  .val { margin-top: 4px; font-size: 36px; line-height: 1; font-weight: 700; font-variant-numeric: tabular-nums; }
  .right { text-align: right; }
  .empty { margin: 0; font-size: 16px; color: #717182; }
`;

export function oddsWidgetBodyHtml(card: ReclaimCard | null, copy: OddsWidgetCopy, locale: string): string {
  if (!card) return `<p class="empty">${esc(copy.empty)}</p>`;
  const next = card.nextEdge == null ? copy.above : copy.next(card.nextEdge);
  return `<div class="sheet"><div class="top"><p class="name">${esc(cardDisplayName(card, locale))}</p><span class="brand">whyup</span></div><p class="ticker">${esc(card.ticker)}</p><p class="until">${esc(copy.until)}</p><div class="cols"><div><p class="lab">${esc(copy.reclaim)}</p><p class="val">${esc(pctLabel(card.reclaimPct))}</p></div><div class="right"><p class="lab">${esc(next)}</p><p class="val">${esc(pctLabel(card.nextPct))}</p></div></div></div>`;
}
