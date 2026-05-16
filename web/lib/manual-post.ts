export function isManualEditorPost(row: {
  gemini_metadata?: Record<string, unknown> | null;
}): boolean {
  return row.gemini_metadata?.source === "manual_editor";
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
