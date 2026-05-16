/**
 * 동일 공시 본문에 대해 호재(bull)·악재(bear) 관점을 나눠 JSON으로 받습니다.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Sentiment } from "@/lib/types";

const DEFAULT_MODEL = "gemini-3-flash-preview";

export type PerspectiveBlock = {
  title: string;
  summary_lines: [string, string, string];
};

export type DualPerspectiveResult = {
  overall_sentiment: Sentiment;
  overall_score: number;
  bull_case: PerspectiveBlock;
  bear_case: PerspectiveBlock;
};

const SYSTEM_INSTRUCTION = `You are an equity research assistant reading a US SEC filing excerpt.

Output ONLY valid JSON (no markdown, no code fences). Shape:
{
  "overall_sentiment":"positive|negative|neutral",
  "overall_score":number,
  "bull_case":{"title":"string","summary_lines":["한글 한 줄","한글 한 줄","한글 한 줄"]},
  "bear_case":{"title":"string","summary_lines":["한글 한 줄","한글 한 줄","한글 한 줄"]}
}

Rules:
- bull_case: 주가·주주 관점에서 가능한 한 **호재적** 해석만 압축 (3문장, 한국어).
- bear_case: **리스크·악재·불확실성**만 압축 (3문장, 한국어). bull과 중복 서술 최소화.
- overall_sentiment / overall_score(-100~+100): 단기 총평.
- 입력이 비었거나 공시와 무관하면 overall neutral, score 0, 각 case 제목 "분석 불가" 수준의 중립 3문장.`;

function parseJson(text: string): DualPerspectiveResult {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  const valid: Sentiment[] = ["positive", "negative", "neutral"];
  const os = parsed.overall_sentiment;
  const overall_sentiment = valid.includes(os as Sentiment) ? (os as Sentiment) : "neutral";
  const overall_score = Number.isFinite(Number(parsed.overall_score))
    ? Number(parsed.overall_score)
    : 0;

  function block(key: "bull_case" | "bear_case"): PerspectiveBlock {
    const b = parsed[key] as Record<string, unknown> | undefined;
    const title = String(b?.title ?? "요약");
    const lines = Array.isArray(b?.summary_lines)
      ? (b.summary_lines as unknown[]).map((x) => String(x).trim()).filter(Boolean)
      : [];
    while (lines.length < 3) lines.push("—");
    return {
      title,
      summary_lines: [lines[0]!, lines[1]!, lines[2]!],
    };
  }

  return {
    overall_sentiment,
    overall_score: Math.max(-100, Math.min(100, overall_score)),
    bull_case: block("bull_case"),
    bear_case: block("bear_case"),
  };
}

export type AnalyzeDualResult =
  | { ok: true; data: DualPerspectiveResult; model: string }
  | { ok: false; error: string };

export async function analyzeDualPerspective(rawContent: string): Promise<AnalyzeDualResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  if (!apiKey) {
    return { ok: false, error: "GEMINI_API_KEY is not configured" };
  }

  const truncated =
    rawContent.length > 48_000 ? `${rawContent.slice(0, 48_000)}\n\n[truncated]` : rawContent;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.35,
      },
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: truncated }] }],
    });
    const text = result.response.text();
    if (!text) return { ok: false, error: "Empty response from Gemini" };
    const data = parseJson(text);
    return { ok: true, data, model: modelName };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gemini error";
    console.error("[analyzeDualPerspective]", message);
    return { ok: false, error: message };
  }
}
