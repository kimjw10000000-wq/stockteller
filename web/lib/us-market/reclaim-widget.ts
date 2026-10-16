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
};

const INITIAL: WidgetState = { cards: null, mode: "off" };
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

let openImpl: (() => void) | null = null;
let closeImpl: (() => void) | null = null;

export function bindReclaimWidgetControls(api: { open: () => void; close: () => void }): () => void {
  openImpl = api.open;
  closeImpl = api.close;
  return () => {
    if (openImpl === api.open) openImpl = null;
    if (closeImpl === api.close) closeImpl = null;
  };
}

export function openReclaimWidget(): void {
  openImpl?.();
}

export function closeReclaimWidget(): void {
  closeImpl?.();
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
const PER_PAGE = 3;
const FONT = '"Apple SD Gothic Neo", "Noto Sans KR", "Noto Sans CJK KR", "Malgun Gothic", sans-serif';

function ellipsis(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let next = text;
  while (next.length > 1 && ctx.measureText(`${next}…`).width > maxWidth) next = next.slice(0, -1);
  return `${next}…`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPair(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  align: "left" | "right",
) {
  ctx.textBaseline = "middle";
  ctx.font = `700 22px ${FONT}`;
  const valueW = ctx.measureText(value).width;
  ctx.font = `400 15px ${FONT}`;
  const shown = ellipsis(ctx, label, Math.max(24, width - valueW - 6));
  const labelW = ctx.measureText(shown).width;
  if (align === "left") {
    ctx.textAlign = "left";
    ctx.fillStyle = "#717182";
    ctx.fillText(shown, x, y);
    ctx.font = `700 22px ${FONT}`;
    ctx.fillStyle = "#030213";
    ctx.fillText(value, x + labelW + 6, y);
  } else {
    ctx.textAlign = "right";
    ctx.font = `700 22px ${FONT}`;
    ctx.fillStyle = "#030213";
    ctx.fillText(value, x + width, y);
    ctx.font = `400 15px ${FONT}`;
    ctx.fillStyle = "#717182";
    ctx.fillText(shown, x + width - valueW - 6, y);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  row: ReclaimCard,
  copy: OddsWidgetCopy,
  locale: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(3, 2, 19, 0.4)";
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#030213";
  ctx.font = `600 24px ${FONT}`;
  ctx.fillText(ellipsis(ctx, cardDisplayName(row, locale), w - 20), x + 10, y + 8);

  ctx.fillStyle = "#717182";
  ctx.font = "400 14px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(ellipsis(ctx, row.ticker, w - 20), x + 10, y + 36);

  const nextLabel = row.nextEdge == null ? copy.above : copy.next(row.nextEdge);
  const colW = (w - 28) / 2;
  drawPair(ctx, copy.reclaim, pctLabel(row.reclaimPct), x + 10, y + 74, colW, "left");
  drawPair(ctx, nextLabel, pctLabel(row.nextPct), x + 18 + colW, y + 74, colW, "right");
}

/** Landscape frame so the system mini window stays small, like a video player. */
export function paintOddsWidget(
  ctx: CanvasRenderingContext2D,
  cards: ReclaimCard[] | null,
  copy: OddsWidgetCopy,
  locale: string,
  page: number,
): number {
  const width = ODDS_PIP_W;
  const height = ODDS_PIP_H;
  const pages = cards && cards.length > 0 ? Math.ceil(cards.length / PER_PAGE) : 1;
  const safePage = ((page % pages) + pages) % pages;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#030213";
  ctx.fillRect(0, 0, width, 6);

  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = "#717182";
  ctx.font = `500 14px ${FONT}`;
  const brandW = ctx.measureText("whyup").width;
  ctx.fillText("whyup", width - 16 - brandW, 16);

  ctx.fillStyle = "#030213";
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText(ellipsis(ctx, copy.title, width - brandW - 40), 16, 12);

  const pageLabel = pages > 1 ? `${safePage + 1}/${pages}` : "";
  ctx.font = `600 14px ${FONT}`;
  const pageW = pageLabel ? ctx.measureText(pageLabel).width : 0;
  if (pageLabel) {
    ctx.fillStyle = "#717182";
    ctx.fillText(pageLabel, width - 16 - pageW, 46);
  }

  ctx.font = `400 15px ${FONT}`;
  ctx.fillStyle = "#717182";
  ctx.fillText(ellipsis(ctx, copy.until, width - 36 - (pageW ? pageW + 12 : 0)), 16, 44);

  if (!cards || cards.length === 0) {
    ctx.font = `400 20px ${FONT}`;
    ctx.fillStyle = "#717182";
    ctx.fillText(cards == null ? copy.loading : copy.empty, 16, 84);
    return pages;
  }

  const slice = cards.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);
  let y = 74;
  const cardW = width - 32;
  const cardH = 100;
  for (const row of slice) {
    drawCard(ctx, row, copy, locale, 16, y, cardW, cardH);
    y += cardH + 8;
  }
  return pages;
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
  #odds-scroll { box-sizing: border-box; height: 100%; overflow: auto; padding: 12px 14px 16px; }
  .top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  h1 { font-size: 16px; line-height: 1.3; font-weight: 650; margin: 0; }
  .brand { font-size: 12px; color: #717182; }
  .until { margin: 4px 0 0; font-size: 12px; line-height: 1.35; color: #717182; }
  .hd { position: sticky; top: 0; background: #fff; padding-bottom: 8px; }
  article { border: 2px solid rgba(3, 2, 19, 0.4); border-radius: 10px; padding: 10px 12px; margin-top: 8px; }
  .name { margin: 0; font-size: 14px; font-weight: 600; line-height: 1.35; }
  .ticker { margin: 2px 0 0; font-family: ui-monospace, monospace; font-size: 12px; color: #717182; }
  .cols { display: flex; justify-content: space-between; gap: 12px; margin-top: 8px; }
  .cols p { margin: 0; }
  .lab { font-size: 12px; line-height: 1.35; color: #717182; }
  .val { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .right { text-align: right; }
  .empty { margin: 8px 0 0; font-size: 14px; color: #717182; }
`;

export function oddsWidgetBodyHtml(cards: ReclaimCard[] | null, copy: OddsWidgetCopy, locale: string): string {
  const head = `<div class="hd"><div class="top"><h1>${esc(copy.title)}</h1><span class="brand">whyup</span></div><p class="until">${esc(copy.until)}</p></div>`;
  if (cards == null) return `${head}<p class="empty">${esc(copy.loading)}</p>`;
  if (cards.length === 0) return `${head}<p class="empty">${esc(copy.empty)}</p>`;
  const items = cards
    .map((row) => {
      const next = row.nextEdge == null ? copy.above : copy.next(row.nextEdge);
      return `<article><p class="name">${esc(cardDisplayName(row, locale))}</p><p class="ticker">${esc(row.ticker)}</p><div class="cols"><div><p class="lab">${esc(copy.reclaim)}</p><p class="val">${esc(pctLabel(row.reclaimPct))}</p></div><div class="right"><p class="lab">${esc(next)}</p><p class="val">${esc(pctLabel(row.nextPct))}</p></div></div></article>`;
    })
    .join("");
  return head + items;
}
