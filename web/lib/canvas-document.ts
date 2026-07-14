import { normalizeEditorContent, stripHtml } from "@/lib/html-utils";
import { ARTICLE_CONTENT_MAX_WIDTH } from "@/lib/overlay-article-layout";

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

/** v2 — 캔버스 전체 기준 오버레이 (마이그레이션용) */
export const OVERLAY_ARTICLE_VERSION_V2 = 2 as const;

/** v3 — 문단(블록) 기준 상대 오버레이 */
export const OVERLAY_ARTICLE_VERSION = 3 as const;

export type OverlayImage = {
  id: string;
  src: string;
  /** 소속 문단(블록) 인덱스 */
  paragraphIndex: number;
  /** 문단 내부 상대 좌표 */
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
  contentMaxWidth: number;
};

export const DEFAULT_CANVAS_WIDTH = ARTICLE_CONTENT_MAX_WIDTH;
export const DEFAULT_CANVAS_MIN_HEIGHT = 120;
export const OVERLAY_Z_BASE = 20;

export function createEmptyOverlayDocument(): OverlayArticleDocument {
  return {
    version: OVERLAY_ARTICLE_VERSION,
    content: "",
    overlay_images: [],
    contentMaxWidth: ARTICLE_CONTENT_MAX_WIDTH,
  };
}

export function createOverlayImage(
  src: string,
  partial?: Partial<
    Pick<OverlayImage, "paragraphIndex" | "x" | "y" | "width" | "height" | "zIndex">
  >
): OverlayImage {
  return {
    id: crypto.randomUUID(),
    src,
    paragraphIndex: partial?.paragraphIndex ?? 0,
    x: partial?.x ?? 8,
    y: partial?.y ?? 8,
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
    paragraphIndex: Math.max(0, Number(raw.paragraphIndex ?? raw.blockId ?? 0) || 0),
    x: Number(raw.x) || 0,
    y: Number(raw.y) || 0,
    width: Math.max(60, Number(raw.width ?? raw.w) || 200),
    height: Math.max(60, Number(raw.height ?? raw.h) || 150),
    zIndex: Number(raw.zIndex) || OVERLAY_Z_BASE,
  };
}

type LegacyV2Document = {
  version: typeof OVERLAY_ARTICLE_VERSION_V2;
  content: string;
  overlay_images: Record<string, unknown>[];
  canvasWidth?: number;
};

function parseLegacyV2Document(raw: string): LegacyV2Document | null {
  try {
    const parsed = JSON.parse(raw) as LegacyV2Document;
    if (parsed?.version === OVERLAY_ARTICLE_VERSION_V2 && Array.isArray(parsed.overlay_images)) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
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

function migrateV2ToV3(v2: LegacyV2Document): OverlayArticleDocument {
  const images = v2.overlay_images
    .map((item) => normalizeOverlayImage(item))
    .filter((item): item is OverlayImage => item !== null)
    .map((img) => ({
      ...img,
      paragraphIndex: img.paragraphIndex || 0,
    }));

  return {
    version: OVERLAY_ARTICLE_VERSION,
    content: v2.content,
    overlay_images: images,
    contentMaxWidth: v2.canvasWidth || ARTICLE_CONTENT_MAX_WIDTH,
  };
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
        contentMaxWidth: Number(parsed.contentMaxWidth ?? parsed.canvasWidth) || ARTICLE_CONTENT_MAX_WIDTH,
      };
    }
    const v2 = parseLegacyV2Document(raw);
    if (v2) return migrateV2ToV3(v2);
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
    .map((el, i) =>
      createOverlayImage(el.content, {
        paragraphIndex: 0,
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        zIndex: Math.max(OVERLAY_Z_BASE, el.zIndex + OVERLAY_Z_BASE + i),
      })
    );

  return {
    version: OVERLAY_ARTICLE_VERSION,
    content,
    overlay_images,
    contentMaxWidth: legacy.canvasWidth || ARTICLE_CONTENT_MAX_WIDTH,
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
    contentMaxWidth: ARTICLE_CONTENT_MAX_WIDTH,
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
  return parseLegacyCanvasDocument(raw ?? "") !== null || parseLegacyV2Document(raw ?? "") !== null;
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

/** @deprecated — v3는 블록별 minHeight로 자동 확장 */
export function computeOverlayContainerHeight(_doc?: OverlayArticleDocument): number {
  void _doc;
  return DEFAULT_CANVAS_MIN_HEIGHT;
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
  if ("overlay_images" in doc && doc.version === OVERLAY_ARTICLE_VERSION) {
    return overlayArticleSummary(doc, maxLen);
  }
  return overlayArticleSummary(migrateLegacyCanvasToOverlay(doc as LegacyCanvasDocument), maxLen);
}
