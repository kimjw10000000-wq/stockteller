import { normalizeEditorContent, stripHtml } from "@/lib/html-utils";
import {
  isOverlayArticleDocument,
  parseBodyToOverlayDocument,
  type OverlayArticleDocument,
  type OverlayImage,
} from "@/lib/canvas-document";
import { parseArticleBlocks } from "@/lib/overlay-article-layout";

/** DB raw_content → 에디터/상세 페이지용 표준 HTML */
export function resolveArticleBodyHtml(raw: string | null | undefined): string {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return "";

  if (isOverlayArticleDocument(trimmed)) {
    return overlayDocumentToInlineHtml(parseBodyToOverlayDocument(trimmed));
  }

  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
  return normalizeEditorContent(trimmed);
}

/** 레거시 오버레이 JSON → 글·이미지 순서대로 인라인 HTML */
export function overlayDocumentToInlineHtml(doc: OverlayArticleDocument): string {
  const blocks = parseArticleBlocks(doc.content);
  const imagesByBlock = new Map<number, OverlayImage[]>();

  for (const img of doc.overlay_images) {
    const idx = Math.max(0, img.paragraphIndex ?? 0);
    const list = imagesByBlock.get(idx) ?? [];
    list.push(img);
    imagesByBlock.set(idx, list);
  }

  const parts: string[] = [];
  for (const block of blocks) {
    parts.push(block.html);
    for (const img of imagesByBlock.get(block.index) ?? []) {
      parts.push(renderInlineImageHtml(img));
    }
  }

  const maxBlock = Math.max(
    ...doc.overlay_images.map((img) => img.paragraphIndex ?? 0),
    blocks.length - 1
  );
  for (let i = blocks.length; i <= maxBlock; i += 1) {
    for (const img of imagesByBlock.get(i) ?? []) {
      parts.push(renderInlineImageHtml(img));
    }
  }

  return parts.join("") || doc.content;
}

function renderInlineImageHtml(img: OverlayImage): string {
  const width = img.width ? ` width="${Math.round(img.width)}"` : "";
  const align = "center";
  return `<p><img src="${escapeAttr(img.src)}" class="editor-inline-image align-${align}" data-align="${align}"${width} alt="" /></p>`;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export function isBodyContentEmpty(raw: string): boolean {
  const html = resolveArticleBodyHtml(raw);
  return stripHtml(html).trim().length === 0;
}

/** 붙여넣기 HTML에서 인라인 스타일·배경 서식 제거 */
export function stripPastedHtmlStyles(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<meta[^>]*>/gi, "")
    .replace(/\sstyle="[^"]*"/gi, "")
    .replace(/\sstyle='[^']*'/gi, "")
    .replace(/\sclass="[^"]*"/gi, "")
    .replace(/\sclass='[^']*'/gi, "")
    .replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, "$1")
    .trim();
}

/** 클립보드에서 순수 이미지 File 추출 */
export function extractClipboardImageFile(
  clipboard: DataTransfer | null | undefined
): File | null {
  if (!clipboard) return null;

  const items = clipboard.items;
  if (items) {
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        return item.getAsFile();
      }
    }
  }

  const files = clipboard.files;
  if (files?.length) {
    for (let i = 0; i < files.length; i += 1) {
      if (files[i].type.startsWith("image/")) return files[i];
    }
  }

  return null;
}
