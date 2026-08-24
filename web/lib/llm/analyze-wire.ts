import type { GeminiAnalysisResult, Sentiment } from "@/lib/types";
import { GroqApiError, groqChatJson, groqModel, isGroqConfigured } from "@/lib/groq/client";

const SYSTEM_INSTRUCTION = `You are an equity research assistant summarizing a GlobeNewswire press-release headline and teaser for listed U.S. stocks.

The model's reasoning/thinking must follow this chain internally before you write the answer:
1) 보도자료의 의도 — 회사가 전달하려는 핵심 사실
2) 재무·희석·거래 영향 — 자금조달·계약·실적 등이 주주에게 미치는 방향
3) 최종 결론 — 단기 투자 관점의 호재/악재/불확실성

Do not output that reasoning as prose. The user-facing answer must be ONLY valid JSON (no markdown, no code fences) with this exact shape:
{"title":"string, concise Korean headline for investors","summary_lines":["line1","line2","line3"],"sentiment":"positive|negative|neutral","score":number}

Hard rules:
- summary_lines: exactly 3 short Korean sentences, in order: [의도] → [재무적 영향] → [최종 결론].
- Do not invent numbers that are not in the teaser.
- sentiment: near-term interpretation for shareholders.
- score: +100 = 매우 호재, -100 = 매우 악재, 0 = 중립.
- If input is empty, return title "분석 불가", three short neutral lines, sentiment "neutral", score 0.`;

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

export type AnalyzeWireResult =
  | { ok: true; data: GeminiAnalysisResult; model: string }
  | { ok: false; error: string; data?: GeminiAnalysisResult };

export async function analyzeWireTeaser(input: {
  title: string;
  teaser: string;
  ticker: string;
}): Promise<AnalyzeWireResult> {
  if (!isGroqConfigured()) {
    return { ok: false, error: "GROQ_API_KEY is not configured" };
  }

  const user = `Ticker: ${input.ticker}\nHeadline: ${input.title}\nTeaser:\n${input.teaser.slice(0, 4_000)}`;

  try {
    const text = await groqChatJson({
      system: SYSTEM_INSTRUCTION,
      user,
      temperature: 0.2,
      maxTokens: 800,
    });
    try {
      const data = parseModelJson(text);
      return { ok: true, data, model: groqModel() };
    } catch (e) {
      const message = e instanceof Error ? e.message : "JSON parse failed";
      return {
        ok: false,
        error: `Failed to parse JSON: ${message}`,
        data: {
          title: "JSON 파싱 오류",
          summary_lines: [text.slice(0, 240), "모델 응답을 구조화하지 못했습니다.", "neutral로 처리합니다."],
          sentiment: "neutral",
          score: 0,
        },
      };
    }
  } catch (e) {
    const message =
      e instanceof GroqApiError ? e.message : e instanceof Error ? e.message : "Unknown LLM error";
    console.error("[analyzeWireTeaser]", message);
    return { ok: false, error: message };
  }
}
