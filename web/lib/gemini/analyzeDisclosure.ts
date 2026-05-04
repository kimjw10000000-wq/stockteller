/**
 * Google AI Studio / Gemini API — official client `@google/generative-ai`.
 * API 키·모델명은 `.env` / `.env.local`의 `GEMINI_API_KEY`, `GEMINI_MODEL`에서 읽습니다.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { GeminiAnalysisResult, Sentiment } from "@/lib/types";

const DEFAULT_MODEL = "gemini-3-flash-preview";

const SYSTEM_INSTRUCTION = `You are an equity research assistant analyzing regulatory disclosures.

The model's reasoning/thinking must follow this chain internally before you write the answer:
1) 공시의 의도 — 회사·규제·시장 맥락에서 이 공시가 전달하려는 핵심 의도
2) 재무적 영향 — 매출·이익·현금흐름·재무건전성·밸류에이션 등에 미치는 방향성과 규모감(정량이 없으면 정성)
3) 최종 결론 — 단기~중기 투자 관점에서 호재/악재·불확실성을 어떻게 보는지

Do not output that reasoning as prose. The user-facing answer must be ONLY valid JSON (no markdown, no code fences) with this exact shape:
{"title":"string, concise Korean headline for investors","summary_lines":["line1","line2","line3"],"sentiment":"positive|negative|neutral","score":number}

Hard rules:
- summary_lines: exactly 3 short Korean sentences, in order: [의도] → [재무적 영향] → [최종 결론].
- sentiment: near-term interpretation for shareholders (not legal advice).
- score: 호재/악재 점수. +100 = 매우 호재적, -100 = 매우 악재적, 0 = 중립.
- Optional key "impact_score" is tolerated if present; it must match "score" when both exist.
- If input is empty or unreadable, return title "분석 불가", three short neutral lines explaining why, sentiment "neutral", score 0.`;

function parseModelJson(text: string): GeminiAnalysisResult {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  const sentiment = parsed.sentiment as string;
  const valid: Sentiment[] = ["positive", "negative", "neutral"];
  const s = valid.includes(sentiment as Sentiment) ? (sentiment as Sentiment) : "neutral";
  const lines = Array.isArray(parsed.summary_lines)
    ? (parsed.summary_lines as unknown[]).map(String).filter(Boolean)
    : [];
  while (lines.length < 3) lines.push("—");

  const rawScore = parsed.score ?? parsed.impact_score;
  const score = Number.isFinite(Number(rawScore)) ? Number(rawScore) : 0;

  return {
    title: String(parsed.title ?? "제목 없음"),
    summary_lines: lines.slice(0, 3),
    sentiment: s,
    score,
  };
}

export type AnalyzeDisclosureResult =
  | { ok: true; data: GeminiAnalysisResult; model: string }
  | { ok: false; error: string; data?: GeminiAnalysisResult };

export async function analyzeDisclosureText(rawContent: string): Promise<AnalyzeDisclosureResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;

  if (!apiKey) {
    return { ok: false, error: "GEMINI_API_KEY is not configured" };
  }

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

    const truncated =
      rawContent.length > 48_000 ? `${rawContent.slice(0, 48_000)}\n\n[truncated]` : rawContent;
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: truncated }] }],
    });

    const text = result.response.text();
    if (!text) {
      return { ok: false, error: "Empty response from Gemini" };
    }

    try {
      const data = parseModelJson(text);
      return { ok: true, data, model: modelName };
    } catch (e) {
      const message = e instanceof Error ? e.message : "JSON parse failed";
      return {
        ok: false,
        error: `Failed to parse Gemini JSON: ${message}`,
        data: {
          title: "JSON 파싱 오류",
          summary_lines: [text.slice(0, 240), "모델 응답을 구조화하지 못했습니다.", "neutral로 처리합니다."],
          sentiment: "neutral",
          score: 0,
        },
      };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown Gemini error";
    console.error("[analyzeDisclosureText]", message);
    return {
      ok: false,
      error: message,
      data: {
        title: "AI 분석 실패",
        summary_lines: [
          "Gemini 호출 중 오류가 발생했습니다.",
          "잠시 후 다시 시도하거나 관리자 로그를 확인하세요.",
          "본문은 그대로 보존됩니다.",
        ],
        sentiment: "neutral",
        score: 0,
      },
    };
  }
}
