import { stripHtml } from "@/lib/html-utils";

export const CANVAS_DOCUMENT_VERSION = 1 as const;

export type CanvasElementType = "text" | "image";

export type CanvasElement = {
  id: string;
  type: CanvasElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  zIndex: number;
};

export type CanvasDocument = {
  version: typeof CANVAS_DOCUMENT_VERSION;
  canvasWidth: number;
  canvasHeight: number;
  elements: CanvasElement[];
};

export const DEFAULT_CANVAS_WIDTH = 960;
export const DEFAULT_CANVAS_HEIGHT = 720;

export function createEmptyCanvasDocument(): CanvasDocument {
  return {
    version: CANVAS_DOCUMENT_VERSION,
    canvasWidth: DEFAULT_CANVAS_WIDTH,
    canvasHeight: DEFAULT_CANVAS_HEIGHT,
    elements: [],
  };
}

export function createCanvasElement(
  type: CanvasElementType,
  partial?: Partial<Pick<CanvasElement, "x" | "y" | "width" | "height" | "content" | "zIndex">>
): CanvasElement {
  return {
    id: crypto.randomUUID(),
    type,
    x: partial?.x ?? 48,
    y: partial?.y ?? 48,
    width: partial?.width ?? (type === "text" ? 360 : 320),
    height: partial?.height ?? (type === "text" ? 160 : 220),
    content: partial?.content ?? "",
    zIndex: partial?.zIndex ?? 1,
  };
}

export function parseCanvasDocument(raw: string | null | undefined): CanvasDocument | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as CanvasDocument;
    if (
      parsed?.version === CANVAS_DOCUMENT_VERSION &&
      Array.isArray(parsed.elements) &&
      typeof parsed.canvasWidth === "number" &&
      typeof parsed.canvasHeight === "number"
    ) {
      return {
        version: CANVAS_DOCUMENT_VERSION,
        canvasWidth: parsed.canvasWidth,
        canvasHeight: parsed.canvasHeight,
        elements: parsed.elements
          .filter((el) => el && typeof el.id === "string" && (el.type === "text" || el.type === "image"))
          .map((el) => ({
            id: el.id,
            type: el.type,
            x: Number(el.x) || 0,
            y: Number(el.y) || 0,
            width: Math.max(80, Number(el.width) || 120),
            height: Math.max(48, Number(el.height) || 80),
            content: String(el.content ?? ""),
            zIndex: Number(el.zIndex) || 1,
          })),
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function serializeCanvasDocument(doc: CanvasDocument): string {
  return JSON.stringify(doc);
}

export function legacyBodyToCanvasDocument(raw: string): CanvasDocument {
  const doc = createEmptyCanvasDocument();
  const trimmed = raw.trim();
  if (!trimmed) return doc;

  const text = trimmed.includes("<") ? stripHtml(trimmed) : trimmed;
  if (!text) return doc;

  doc.elements.push(
    createCanvasElement("text", {
      x: 40,
      y: 40,
      width: 520,
      height: Math.min(360, Math.max(160, Math.ceil(text.length / 28) * 24)),
      content: text,
      zIndex: 1,
    })
  );
  return doc;
}

export function parseBodyToCanvasDocument(raw: string): CanvasDocument {
  return parseCanvasDocument(raw) ?? legacyBodyToCanvasDocument(raw);
}

export function isCanvasDocument(raw: string | null | undefined): boolean {
  return parseCanvasDocument(raw) !== null;
}

export function computeCanvasRenderHeight(doc: CanvasDocument): number {
  const base = doc.canvasHeight || DEFAULT_CANVAS_HEIGHT;
  const bottom = doc.elements.reduce((max, el) => Math.max(max, el.y + el.height + 32), 0);
  return Math.max(base, bottom);
}

export function isCanvasDocumentEmpty(doc: CanvasDocument): boolean {
  if (doc.elements.length === 0) return true;
  return doc.elements.every((el) => {
    if (el.type === "image") return !el.content.trim();
    return !el.content.trim();
  });
}

export function canvasDocumentSummary(doc: CanvasDocument, maxLen = 560): string {
  const chunks = doc.elements
    .filter((el) => el.type === "text" && el.content.trim())
    .map((el) => el.content.trim().replace(/\s+/g, " "));
  const joined = chunks.join(" ");
  if (!joined) return "";
  if (joined.length <= maxLen) return joined;
  return `${joined.slice(0, maxLen - 1).trim()}…`;
}

export function isBodyContentEmpty(raw: string): boolean {
  const canvas = parseCanvasDocument(raw);
  if (canvas) return isCanvasDocumentEmpty(canvas);
  const plain = raw.includes("<") ? stripHtml(raw) : raw;
  return plain.trim().length === 0;
}
