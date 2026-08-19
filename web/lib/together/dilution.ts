import { togetherChatJson } from "./client";

export type DilutionType =
  | "ATM"
  | "S-3"
  | "registered direct"
  | "PIPE"
  | "warrant"
  | "other"
  | "none";

export type DilutionClassification = {
  dilution: boolean;
  type: DilutionType;
  summary: string;
};

const TYPES: DilutionType[] = [
  "ATM",
  "S-3",
  "registered direct",
  "PIPE",
  "warrant",
  "other",
  "none",
];

const SYSTEM = `You classify US-listed company press releases for equity dilution.
Reply with JSON only, no markdown:
{"dilution":true|false,"type":"ATM|S-3|registered direct|PIPE|warrant|other|none","summary":"2-3 English sentences"}
Rules:
- dilution=true only if the company is issuing, selling, or registering common stock, ATM, registered direct, PIPE, convertible, or warrants that can dilute existing holders.
- type=none when dilution=false.
- Ignore ordinary earnings, product, hiring, and non-equity financing news.
- summary must be English only. Never write Korean.`;

function parseClassification(text: string): DilutionClassification {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  const typeRaw = String(parsed.type ?? "none");
  const type = TYPES.includes(typeRaw as DilutionType) ? (typeRaw as DilutionType) : "other";
  const dilution = Boolean(parsed.dilution);
  return {
    dilution,
    type: dilution ? (type === "none" ? "other" : type) : "none",
    summary: String(parsed.summary ?? "").trim() || "No summary.",
  };
}

export async function classifyDilutionArticle(params: {
  title: string;
  body: string;
}): Promise<DilutionClassification> {
  const truncated =
    params.body.length > 12_000 ? `${params.body.slice(0, 12_000)}\n\n[truncated]` : params.body;
  const text = await togetherChatJson({
    system: SYSTEM,
    user: `Title: ${params.title}\n\n${truncated}`,
  });
  return parseClassification(text);
}
