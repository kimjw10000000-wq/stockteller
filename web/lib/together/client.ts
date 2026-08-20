const DEFAULT_BASE = "https://api.together.ai/v1";
const DEFAULT_MODEL = "Qwen/Qwen3.5-9B";

export function isTogetherConfigured(): boolean {
  return Boolean(process.env.TOGETHER_API_KEY?.trim());
}

export function togetherModel(): string {
  return process.env.TOGETHER_MODEL?.trim() || DEFAULT_MODEL;
}

function togetherBaseUrl(): string {
  return (process.env.TOGETHER_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/$/, "");
}

export class TogetherApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number
  ) {
    super(message);
    this.name = "TogetherApiError";
  }
}

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

export async function togetherChatJson(params: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const apiKey = process.env.TOGETHER_API_KEY?.trim();
  if (!apiKey) {
    throw new TogetherApiError("TOGETHER_API_KEY is not configured", 503);
  }

  const res = await fetch(`${togetherBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: togetherModel(),
      temperature: params.temperature ?? 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ] satisfies ChatMessage[],
      chat_template_kwargs: { enable_thinking: false },
      max_tokens: params.maxTokens ?? 800,
    }),
  });

  const raw = (await res.json().catch(() => null)) as ChatCompletionResponse | null;
  if (!res.ok) {
    const msg = raw?.error?.message?.trim() || `Together HTTP ${res.status}`;
    throw new TogetherApiError(msg, res.status);
  }

  const text = raw?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new TogetherApiError("Empty response from Together", 502);
  }
  return text;
}
