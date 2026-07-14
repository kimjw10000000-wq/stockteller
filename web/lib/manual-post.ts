import { stripHtml } from "@/lib/html-utils";
import { resolveArticleBodyHtml } from "@/lib/article-body";
import { isOverlayArticleDocument } from "@/lib/canvas-document";

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
  const html = resolveArticleBodyHtml(body);
  const plain = stripHtml(html).replace(/\s+/g, " ").trim();
  if (!plain) return "";
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen - 1).trim()}…`;
}

export function bodyLooksLikeHtml(body: string): boolean {
  if (isOverlayArticleDocument(body)) return true;
  return /<[a-z][\s\S]*>/i.test(body);
}

/** @deprecated 인라인 HTML만 사용 */
export function bodyIsOverlayLayout(body: string): boolean {
  return isOverlayArticleDocument(body);
}

/** @deprecated */
export function bodyIsCanvasLayout(body: string): boolean {
  return bodyIsOverlayLayout(body);
}
