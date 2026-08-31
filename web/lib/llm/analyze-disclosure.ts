import type { GeminiAnalysisResult, Sentiment } from "@/lib/types";
import { GroqApiError, groqChatJson, groqModel, isGroqConfigured } from "@/lib/groq/client";

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

const NEWS_INSTRUCTION = `You are an equity research assistant summarizing a company press release that was distributed over a newswire (GlobeNewswire, Business Wire, PR Newswire, or similar).

The model's reasoning/thinking must follow this chain internally before you write the answer:
1) 보도자료의 의도 — 회사가 시장에 전달하려는 핵심 사실
2) 재무적 영향 — 매출·이익·현금흐름·희석·밸류에이션 등에 미치는 방향성과 규모감(정량이 없으면 정성)
3) 최종 결론 — 단기~중기 투자 관점에서 호재/악재·불확실성

Do not output that reasoning as prose. The user-facing answer must be ONLY valid JSON (no markdown, no code fences) with this exact shape:
{"title":"string, concise Korean headline for investors","summary_lines":["line1","line2","line3"],"sentiment":"positive|negative|neutral","score":number}

Hard rules:
- summary_lines: exactly 3 short Korean sentences, in order: [의도] → [재무적 영향] → [최종 결론].
- Use only the press-release body. Do not invent SEC form items or exhibit numbers that are not in the text.
- sentiment: near-term interpretation for shareholders (not legal advice).
- score: 호재/악재 점수. +100 = 매우 호재적, -100 = 매우 악재적, 0 = 중립.
- If input is empty or unreadable, return title "분석 불가", three short neutral lines explaining why, sentiment "neutral", score 0.`;

const SEC_6K_INSTRUCTION = `You are an equity research assistant summarizing an SEC Form 6-K cover document (the text that appears when the filing is first opened), not a newswire press release.

The model's reasoning/thinking must follow this chain internally before you write the answer:
1) 공시의 의도 — 이 6-K가 SEC에 제출·furnish된 이유
2) 재무적 영향 — 공시 사실이 재무·지배구조·상장 지위에 미치는 방향성
3) 최종 결론 — 단기~중기 투자 관점의 호재/악재·불확실성

Do not output that reasoning as prose. The user-facing answer must be ONLY valid JSON (no markdown, no code fences) with this exact shape:
{"title":"string, concise Korean headline for investors","summary_lines":["line1","line2","line3"],"sentiment":"positive|negative|neutral","score":number}

Hard rules:
- summary_lines: exactly 3 short Korean sentences, in order: [의도] → [재무적 영향] → [최종 결론].
- Summarize the 6-K cover / furnished description. If an Exhibit 99.1 press release is included in the input, use it as supporting context only when the prompt says so.
- sentiment: near-term interpretation for shareholders (not legal advice).
- score: 호재/악재 점수. +100 = 매우 호재적, -100 = 매우 악재적, 0 = 중립.
- If input is empty or unreadable, return title "분석 불가", three short neutral lines explaining why, sentiment "neutral", score 0.`;

export type AnalyzeDisclosureResult =
  | { ok: true; data: GeminiAnalysisResult; model: string }
  | { ok: false; error: string; data?: GeminiAnalysisResult };

async function runGroqAnalysis(system: string, rawContent: string): Promise<AnalyzeDisclosureResult> {
  if (!isGroqConfigured()) {
    return { ok: false, error: "GROQ_API_KEY is not configured" };
  }

  const truncated =
    rawContent.length > 24_000 ? `${rawContent.slice(0, 24_000)}\n\n[truncated]` : rawContent;

  try {
    const text = await groqChatJson({
      system,
      user: truncated,
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
    console.error("[analyzeDisclosureText]", message);
    return {
      ok: false,
      error: message,
      data: {
        title: "AI 분석 실패",
        summary_lines: [
          "요약 호출 중 오류가 발생했습니다.",
          "잠시 후 다시 시도하거나 관리자 로그를 확인하세요.",
          "본문은 그대로 보존됩니다.",
        ],
        sentiment: "neutral",
        score: 0,
      },
    };
  }
}

export async function analyzeDisclosureText(rawContent: string): Promise<AnalyzeDisclosureResult> {
  return runGroqAnalysis(SYSTEM_INSTRUCTION, rawContent);
}

export async function analyzeFilingText(
  rawContent: string,
  kind: "news" | "sec"
): Promise<AnalyzeDisclosureResult> {
  return runGroqAnalysis(kind === "news" ? NEWS_INSTRUCTION : SEC_6K_INSTRUCTION, rawContent);
}
