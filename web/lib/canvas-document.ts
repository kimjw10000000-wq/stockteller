import { normalizeEditorContent, stripHtml } from "@/lib/html-utils";

/** v1 — 레거시 PPT 캔버스 (마이그레이션용) */
export const CANVAS_DOCUMENT_VERSION = 1 as const;

export type LegacyCanvasElement = {
  id: string;
  type: "text" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  zIndex: number;
};

export type LegacyCanvasDocument = {
  version: typeof CANVAS_DOCUMENT_VERSION;
  canvasWidth: number;
  canvasHeight: number;
  elements: LegacyCanvasElement[];
};

/** v2 — 텍스트(HTML) + 오버레이 이미지 */
export const OVERLAY_ARTICLE_VERSION = 2 as const;

export type OverlayImage = {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
};

export type OverlayArticleDocument = {
  version: typeof OVERLAY_ARTICLE_VERSION;
  content: string;
  overlay_images: OverlayImage[];
  canvasWidth: number;
};

export const DEFAULT_CANVAS_WIDTH = 960;
export const DEFAULT_CANVAS_MIN_HEIGHT = 480;
export const OVERLAY_Z_BASE = 20;

export function createEmptyOverlayDocument(): OverlayArticleDocument {
  return {
    version: OVERLAY_ARTICLE_VERSION,
    content: "",
    overlay_images: [],
    canvasWidth: DEFAULT_CANVAS_WIDTH,
  };
}

export function createOverlayImage(
  src: string,
  partial?: Partial<Pick<OverlayImage, "x" | "y" | "width" | "height" | "zIndex">>
): OverlayImage {
  return {
    id: crypto.randomUUID(),
    src,
    x: partial?.x ?? 64,
    y: partial?.y ?? 64,
    width: partial?.width ?? 280,
    height: partial?.height ?? 200,
    zIndex: partial?.zIndex ?? OVERLAY_Z_BASE,
  };
}

function normalizeOverlayImage(raw: Record<string, unknown>): OverlayImage | null {
  const src = String(raw.src ?? raw.content ?? "").trim();
  if (!src) return null;
  return {
    id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
    src,
    x: Number(raw.x) || 0,
    y: Number(raw.y) || 0,
    width: Math.max(60, Number(raw.width ?? raw.w) || 200),
    height: Math.max(60, Number(raw.height ?? raw.h) || 150),
    zIndex: Number(raw.zIndex) || OVERLAY_Z_BASE,
  };
}

function parseLegacyCanvasDocument(raw: string): LegacyCanvasDocument | null {
  try {
    const parsed = JSON.parse(raw) as LegacyCanvasDocument;
    if (parsed?.version === CANVAS_DOCUMENT_VERSION && Array.isArray(parsed.elements)) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

export function parseOverlayArticleDocument(raw: string | null | undefined): OverlayArticleDocument | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed?.version === OVERLAY_ARTICLE_VERSION) {
      const content = typeof parsed.content === "string" ? parsed.content : "";
      const images = Array.isArray(parsed.overlay_images)
        ? parsed.overlay_images
            .map((item) => normalizeOverlayImage(item as Record<string, unknown>))
            .filter((item): item is OverlayImage => item !== null)
        : [];
      return {
        version: OVERLAY_ARTICLE_VERSION,
        content,
        overlay_images: images,
        canvasWidth: Number(parsed.canvasWidth) || DEFAULT_CANVAS_WIDTH,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function migrateLegacyCanvasToOverlay(legacy: LegacyCanvasDocument): OverlayArticleDocument {
  const textChunks = legacy.elements
    .filter((el) => el.type === "text" && el.content.trim())
    .map((el) => el.content.trim());
  const plain = textChunks.join("\n\n");
  const content = plain ? normalizeEditorContent(plain) : "";

  const overlay_images = legacy.elements
    .filter((el) => el.type === "image" && el.content.trim())
    .map((el) =>
      createOverlayImage(el.content, {
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        zIndex: Math.max(OVERLAY_Z_BASE, el.zIndex + OVERLAY_Z_BASE),
      })
    );

  return {
    version: OVERLAY_ARTICLE_VERSION,
    content,
    overlay_images,
    canvasWidth: legacy.canvasWidth || DEFAULT_CANVAS_WIDTH,
  };
}

export function legacyBodyToOverlayDocument(raw: string): OverlayArticleDocument {
  const legacy = parseLegacyCanvasDocument(raw);
  if (legacy) return migrateLegacyCanvasToOverlay(legacy);

  const overlay = parseOverlayArticleDocument(raw);
  if (overlay) return overlay;

  const trimmed = raw.trim();
  if (!trimmed) return createEmptyOverlayDocument();

  return {
    version: OVERLAY_ARTICLE_VERSION,
    content: normalizeEditorContent(trimmed),
    overlay_images: [],
    canvasWidth: DEFAULT_CANVAS_WIDTH,
  };
}

export function parseBodyToOverlayDocument(raw: string): OverlayArticleDocument {
  return parseOverlayArticleDocument(raw) ?? legacyBodyToOverlayDocument(raw);
}

export function serializeOverlayArticleDocument(doc: OverlayArticleDocument): string {
  return JSON.stringify(doc);
}

export function isOverlayArticleDocument(raw: string | null | undefined): boolean {
  if (parseOverlayArticleDocument(raw)) return true;
  return parseLegacyCanvasDocument(raw ?? "") !== null;
}

export function computeOverlayContainerHeight(doc: OverlayArticleDocument): number {
  const imageBottom = doc.overlay_images.reduce(
    (max, img) => Math.max(max, img.y + img.height + 40),
    0
  );
  return Math.max(DEFAULT_CANVAS_MIN_HEIGHT, imageBottom);
}

export function isOverlayArticleEmpty(doc: OverlayArticleDocument): boolean {
  const hasText = stripHtml(doc.content).trim().length > 0;
  const hasImages = doc.overlay_images.some((img) => img.src.trim());
  return !hasText && !hasImages;
}

export function overlayArticleSummary(doc: OverlayArticleDocument, maxLen = 560): string {
  const plain = stripHtml(doc.content).replace(/\s+/g, " ").trim();
  if (!plain) return "";
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen - 1).trim()}…`;
}

export function isBodyContentEmpty(raw: string): boolean {
  const doc = parseOverlayArticleDocument(raw);
  if (doc) return isOverlayArticleEmpty(doc);
  const legacy = parseLegacyCanvasDocument(raw);
  if (legacy) return isOverlayArticleEmpty(migrateLegacyCanvasToOverlay(legacy));
  const plain = raw.includes("<") ? stripHtml(raw) : raw;
  return plain.trim().length === 0;
}

/** @deprecated use isOverlayArticleDocument */
export function isCanvasDocument(raw: string | null | undefined): boolean {
  return isOverlayArticleDocument(raw);
}

/** @deprecated use parseBodyToOverlayDocument */
export function parseBodyToCanvasDocument(raw: string): LegacyCanvasDocument | OverlayArticleDocument {
  const legacy = parseLegacyCanvasDocument(raw);
  if (legacy) return legacy;
  return parseBodyToOverlayDocument(raw);
}

/** @deprecated use parseBodyToOverlayDocument */
export function parseCanvasDocument(raw: string): OverlayArticleDocument | null {
  if (!raw?.trim()) return null;
  return parseBodyToOverlayDocument(raw);
}

/** @deprecated use computeOverlayContainerHeight */
export function computeCanvasRenderHeight(doc: OverlayArticleDocument): number {
  return computeOverlayContainerHeight(doc);
}

/** @deprecated use overlayArticleSummary */
export function canvasDocumentSummary(
  doc: LegacyCanvasDocument | OverlayArticleDocument,
  maxLen = 560
): string {
  if ("overlay_images" in doc) return overlayArticleSummary(doc, maxLen);
  return overlayArticleSummary(migrateLegacyCanvasToOverlay(doc), maxLen);
}
