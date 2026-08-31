import type { GeminiAnalysisResult, Sentiment } from "@/lib/types";
import { GroqApiError, groqChatJson, groqModel, isGroqConfigured } from "@/lib/groq/client";
import {
  applyFigureGlossary,
  extractSourceFigures,
  figuresPromptBlock,
  inventedManAmounts,
} from "@/lib/sec/source-figures";

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

export type SummaryBudget = {
  minSentences: number;
  maxSentences: number;
  minChars: number;
  maxChars: number;
  maxTokens: number;
};

/** 원문 길이에 비례한 한국어 요약 분량. 1만 자 이상은 12문장·1800자에서 자른다. */
export function summaryBudgetForSource(charCount: number): SummaryBudget {
  const n = Math.max(0, charCount);
  if (n <= 2_000) {
    return { minSentences: 2, maxSentences: 4, minChars: 200, maxChars: 500, maxTokens: 1_000 };
  }
  if (n <= 8_000) {
    return { minSentences: 5, maxSentences: 8, minChars: 500, maxChars: 1_000, maxTokens: 1_600 };
  }
  return { minSentences: 8, maxSentences: 12, minChars: 1_000, maxChars: 1_800, maxTokens: 2_400 };
}

function filingInstruction(kind: "news" | "sec"): string {
  const source =
    kind === "news"
      ? "a company press release distributed over a newswire (GlobeNewswire, Business Wire, PR Newswire, or similar). Use only the press-release body."
      : "an SEC Form 6-K (cover text and/or Exhibit 99.1). Use only what the filing actually says.";

  return `You extract a factual Korean summary of ${source}

Write Korean directly. Do not draft in English and then translate.

User-facing answer must be ONLY valid JSON (no markdown, no code fences):
{"title":"string, concise Korean headline that restates facts","summary_lines":["sentence1","sentence2"]}

Hard rules:
- Facts only. Restate names, dates, and tickers from the text. If a figure is not in the text, omit it — never invent.
- The user message lists source figure strings (money, percents, share counts, split/merger ratios). Copy those English strings EXACTLY. Do not convert million into 만 or rewrite 1-for-20.
- Do not call the news 호재 or 악재. Do not assign a sentiment or score.
- Do not estimate financial impact, valuation, dilution, or investor conclusions. If the text itself states an amount or effect, copy that statement; do not interpret beyond it.
- Do not invent SEC form items or exhibit numbers that are not in the text.
- The user message includes a sentence and character budget. Follow it: longer source → more sentences (up to max); shorter source → fewer (down to min). Never exceed max sentences or max characters.
- Each summary_lines item is one complete Korean sentence.
- If input is empty or unreadable, return title "요약 불가" and 1-2 short Korean lines explaining why.`;
}

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

function parseLineList(parsed: Record<string, unknown>): string[] {
  if (Array.isArray(parsed.summary_lines)) {
    return (parsed.summary_lines as unknown[]).map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof parsed.summary === "string" && parsed.summary.trim()) {
    return parsed.summary
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function trimToBudget(lines: string[], budget: SummaryBudget): string[] {
  const kept: string[] = [];
  let total = 0;
  for (const raw of lines.slice(0, budget.maxSentences)) {
    const line = raw.trim();
    if (!line) continue;
    if (kept.length >= budget.minSentences && total + line.length > budget.maxChars) break;
    kept.push(line);
    total += line.length;
  }
  return kept.length ? kept : lines.slice(0, 1).map((s) => s.trim()).filter(Boolean);
}

function parseFilingJson(text: string, budget: SummaryBudget): GeminiAnalysisResult {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  const lines = trimToBudget(parseLineList(parsed), budget);
  return {
    title: String(parsed.title ?? "제목 없음").trim() || "제목 없음",
    summary_lines: lines.length ? lines : ["원문에서 요약할 문장을 찾지 못했습니다."],
    sentiment: "neutral",
    score: 0,
  };
}

export type AnalyzeDisclosureResult =
  | { ok: true; data: GeminiAnalysisResult; model: string }
  | { ok: false; error: string; data?: GeminiAnalysisResult };

function fallbackResult(title: string, lines: string[]): GeminiAnalysisResult {
  return { title, summary_lines: lines, sentiment: "neutral", score: 0 };
}

function retryAfterMs(err: unknown): number | null {
  const message = err instanceof Error ? err.message : String(err);
  const status = err instanceof GroqApiError ? err.httpStatus : 0;
  if (status !== 429 && !/rate limit/i.test(message)) return null;
  const m = /try again in ([\d.]+)\s*s/i.exec(message);
  const sec = m ? Number(m[1]) : 35;
  if (!Number.isFinite(sec) || sec <= 0) return 35_000;
  return Math.min(90_000, Math.ceil(sec * 1000) + 800);
}

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
        data: fallbackResult("JSON 파싱 오류", [
          text.slice(0, 240),
          "모델 응답을 구조화하지 못했습니다.",
          "neutral로 처리합니다.",
        ]),
      };
    }
  } catch (e) {
    const message =
      e instanceof GroqApiError ? e.message : e instanceof Error ? e.message : "Unknown LLM error";
    console.error("[analyzeDisclosureText]", message);
    return {
      ok: false,
      error: message,
      data: fallbackResult("AI 분석 실패", [
        "요약 호출 중 오류가 발생했습니다.",
        "잠시 후 다시 시도하거나 관리자 로그를 확인하세요.",
        "본문은 그대로 보존됩니다.",
      ]),
    };
  }
}

function localizeFilingResult(
  data: GeminiAnalysisResult,
  source: string
): GeminiAnalysisResult | { error: string } {
  const figures = extractSourceFigures(source);
  const title = applyFigureGlossary(data.title, figures);
  const summary_lines = data.summary_lines.map((line) => applyFigureGlossary(line, figures));
  const invented = inventedManAmounts([title, ...summary_lines].join("\n"), figures);
  if (invented.length) {
    return { error: `요약 금액이 원문과 불일치: ${invented.join(", ")}` };
  }
  return { ...data, title, summary_lines, sentiment: "neutral", score: 0 };
}

async function runFilingAnalysis(
  kind: "news" | "sec",
  rawContent: string
): Promise<AnalyzeDisclosureResult> {
  if (!isGroqConfigured()) {
    return { ok: false, error: "GROQ_API_KEY is not configured" };
  }

  const source = rawContent.length > 24_000 ? rawContent.slice(0, 24_000) : rawContent;
  const figures = extractSourceFigures(source);
  const budget = summaryBudgetForSource(source.length);
  const user = [
    `[요약 분량] 한국어 문장 ${budget.minSentences}~${budget.maxSentences}개, 전체 ${budget.minChars}~${budget.maxChars}자. 이 범위를 넘기지 마세요.`,
    figuresPromptBlock(figures),
    source.trim() ? source : "(empty)",
    source.length < rawContent.length ? "[truncated]" : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  let lastError = "Unknown LLM error";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const text = await groqChatJson({
        system: filingInstruction(kind),
        user,
        temperature: 0.1,
        maxTokens: budget.maxTokens,
      });
      try {
        const parsed = parseFilingJson(text, budget);
        const localized = localizeFilingResult(parsed, source);
        if ("error" in localized) {
          lastError = localized.error;
          console.warn("[analyzeFilingText]", lastError);
          if (attempt < 2) continue;
          return { ok: false, error: lastError, data: fallbackResult("요약 숫자 오류", [lastError]) };
        }
        return { ok: true, data: localized, model: groqModel() };
      } catch (e) {
        const message = e instanceof Error ? e.message : "JSON parse failed";
        return {
          ok: false,
          error: `Failed to parse JSON: ${message}`,
          data: fallbackResult("JSON 파싱 오류", ["모델 응답을 구조화하지 못했습니다."]),
        };
      }
    } catch (e) {
      lastError =
        e instanceof GroqApiError ? e.message : e instanceof Error ? e.message : "Unknown LLM error";
      const wait = retryAfterMs(e);
      if (wait == null || attempt === 2) {
        console.error("[analyzeFilingText]", lastError);
        break;
      }
      console.warn(`[analyzeFilingText] rate limited, retry in ${Math.ceil(wait / 1000)}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  return {
    ok: false,
    error: lastError,
    data: fallbackResult("AI 요약 실패", ["요약 호출 중 오류가 발생했습니다.", "원문 링크만 저장합니다."]),
  };
}

export async function analyzeDisclosureText(rawContent: string): Promise<AnalyzeDisclosureResult> {
  return runGroqAnalysis(SYSTEM_INSTRUCTION, rawContent);
}

export async function analyzeFilingText(
  rawContent: string,
  kind: "news" | "sec"
): Promise<AnalyzeDisclosureResult> {
  return runFilingAnalysis(kind, rawContent);
}
