/**
 * Closed-set newswire names. Detection is deterministic (not LLM).
 * Source filings are not modified; the label is applied to the stored Korean summary.
 */

export const LISTED_NEWSWIRES = [
  { name: "NetworkNewsWire", re: /network\s*newswire/i },
  { name: "NewMediaWire", re: /new\s*media\s*wire|newmedia\s*wire/i },
  { name: "GlobeNewswire", re: /globe\s*newswire/i },
  { name: "PR Newswire", re: /\bpr\s*newswire\b|\bprnewswire\b/i },
  { name: "Business Wire", re: /business\s*wire/i },
  { name: "ACCESSWIRE", re: /access\s*wire/i },
] as const;

export function detectListedNewswire(text: string): string | null {
  if (!text) return null;
  for (const { name, re } of LISTED_NEWSWIRES) {
    if (re.test(text)) return name;
  }
  return null;
}

export function newswireAttributionLine(wire: string): string {
  return `본 내용은 ${wire}에 배포된 보도자료입니다.`;
}

export function summaryHasNewswireAttribution(text: string, wire?: string | null): boolean {
  const body = text || "";
  if (/본 내용은 .+에 배포된 보도자료입니다/.test(body)) return true;
  if (/based on a press release distributed by/i.test(body)) return true;
  if (wire && body.includes(`${wire}에 배포된 보도자료`)) return true;
  return false;
}

/** Append attribution to a Korean summary. Does not change the source filing. */
export function withNewswireAttribution(summary: string, wire: string | null | undefined): string {
  const label = wire?.trim();
  if (!label) return summary;
  const body = (summary || "").trim();
  const line = newswireAttributionLine(label);
  if (summaryHasNewswireAttribution(body, label)) return body;
  return body ? `${body}\n${line}` : line;
}

export function resolveNewsWireLabel(item: {
  newswire?: string | null;
  source?: string | null;
}): string | null {
  const fromCol = item.newswire?.trim();
  if (fromCol) return fromCol;
  if (item.source === "globenewswire") return "GlobeNewswire";
  return null;
}
