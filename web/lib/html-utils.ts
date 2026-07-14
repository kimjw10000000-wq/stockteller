/** HTML 태그 제거 — 요약·유효성 검사용 */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** plain text 본문 → TipTap HTML (기존 textarea 글 호환) */
export function normalizeEditorContent(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;

  return trimmed
    .split(/\r?\n/)
    .map((line) => {
      const text = line.trim();
      return text ? `<p>${escapeHtml(text)}</p>` : "<p><br></p>";
    })
    .join("");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function isEditorContentEmpty(html: string): boolean {
  return stripHtml(html).length === 0;
}
