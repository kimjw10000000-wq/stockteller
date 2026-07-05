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
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const joined = lines.slice(0, 4).join("\n");
  if (joined.length <= maxLen) return joined;
  return `${joined.slice(0, maxLen).trim()}…`;
}
