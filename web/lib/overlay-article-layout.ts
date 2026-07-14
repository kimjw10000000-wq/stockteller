/** 어드민·상세 페이지 본문 가로 규격 통일 (Tailwind max-w-3xl = 48rem) */
export const ARTICLE_CONTENT_MAX_WIDTH = 768;

export type ArticleBlock = {
  index: number;
  html: string;
};

const BLOCK_TAG_PATTERN =
  /<(p|h[1-6]|blockquote|pre|ul|ol|div)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi;

/** TipTap HTML을 문단(블록) 단위로 분리 */
export function parseArticleBlocks(html: string): ArticleBlock[] {
  const trimmed = html.trim();
  if (!trimmed) return [{ index: 0, html: "<p></p>" }];

  const blocks: ArticleBlock[] = [];
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  const re = new RegExp(BLOCK_TAG_PATTERN.source, "gi");
  while ((match = re.exec(trimmed)) !== null) {
    blocks.push({ index: blocks.length, html: match[0] });
    lastIndex = re.lastIndex;
  }

  if (blocks.length === 0) {
    return [{ index: 0, html: `<p>${escapeHtml(stripTags(trimmed))}</p>` }];
  }

  const trailing = trimmed.slice(lastIndex).trim();
  if (trailing) {
    blocks.push({ index: blocks.length, html: `<p>${escapeHtml(stripTags(trailing))}</p>` });
  }

  return blocks;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    .replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, "<p>$1</p>")
    .trim();
}

/** 클립보드에서 순수 이미지 File 추출 (html 서식 무시) */
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

export function blockMinHeightForImages(
  images: { y: number; height: number }[],
  base = 24
): number {
  if (images.length === 0) return base;
  return Math.max(base, ...images.map((img) => img.y + img.height + 16));
}
