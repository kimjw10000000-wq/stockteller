const DEFAULT_BASE = "https://api.groq.com/openai/v1";
const DEFAULT_MODEL = "openai/gpt-oss-20b";

export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

export function groqModel(): string {
  return process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL;
}

function groqBaseUrl(): string {
  return (process.env.GROQ_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/$/, "");
}

export class GroqApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number
  ) {
    super(message);
    this.name = "GroqApiError";
  }
}

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
};

export async function groqChatJson(params: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new GroqApiError("GROQ_API_KEY is not configured", 503);
  }

  const res = await fetch(`${groqBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: groqModel(),
      temperature: params.temperature ?? 0.1,
      response_format: { type: "json_object" },
      reasoning_effort: "low",
      max_completion_tokens: params.maxTokens ?? 800,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ] satisfies ChatMessage[],
    }),
  });

  const raw = (await res.json().catch(() => null)) as ChatCompletionResponse | null;
  if (!res.ok) {
    const msg = raw?.error?.message?.trim() || `Groq HTTP ${res.status}`;
    throw new GroqApiError(msg, res.status);
  }

  const text = raw?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new GroqApiError("Empty response from Groq", 502);
  }
  return text;
}
