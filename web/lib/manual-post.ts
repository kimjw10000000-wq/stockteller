import { stripHtml } from "@/lib/html-utils";
import {
  isOverlayArticleDocument,
  overlayArticleSummary,
  parseBodyToOverlayDocument,
} from "@/lib/canvas-document";

export function isManualEditorPost(row: {
  gemini_metadata?: Record<string, unknown> | null;
}): boolean {
  const source = row.gemini_metadata?.source;
  return source === "manual_editor" || source === "admin_publish";
}

export function getCoverImageUrl(row: {
  gemini_metadata?: Record<string, unknown> | null;
}): string | null {
  const url = row.gemini_metadata?.cover_image;
  return typeof url === "string" && url.startsWith("http") ? url : null;
}

export function previewSummaryFromBody(body: string, maxLen = 560): string {
  if (isOverlayArticleDocument(body)) {
    const doc = parseBodyToOverlayDocument(body);
    return overlayArticleSummary(doc, maxLen);
  }

  const plain = body.includes("<") ? stripHtml(body) : body;
  const lines = plain
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const joined = (lines.length ? lines : plain.split(/\s+/).filter(Boolean)).slice(0, 4).join("\n");
  if (joined.length <= maxLen) return joined;
  return `${joined.slice(0, maxLen).trim()}…`;
}

export function bodyLooksLikeHtml(body: string): boolean {
  if (isOverlayArticleDocument(body)) return false;
  return /<[a-z][\s\S]*>/i.test(body);
}

export function bodyIsOverlayLayout(body: string): boolean {
  return isOverlayArticleDocument(body);
}

/** @deprecated bodyIsOverlayLayout 사용 */
export function bodyIsCanvasLayout(body: string): boolean {
  return bodyIsOverlayLayout(body);
}
