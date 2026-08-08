const DEFAULT_BASE = "https://openapi.tossinvest.com";

type TokenCache = {
  accessToken: string;
  expiresAtMs: number;
};

let tokenCache: TokenCache | null = null;

export function isTossConfigured(): boolean {
  return Boolean(
    process.env.TOSSINVEST_CLIENT_ID?.trim() && process.env.TOSSINVEST_CLIENT_SECRET?.trim()
  );
}

function baseUrl(): string {
  return (process.env.TOSSINVEST_API_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/$/, "");
}

export class TossApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly code?: string,
    readonly requestId?: string
  ) {
    super(message);
    this.name = "TossApiError";
  }
}

async function fetchAccessToken(): Promise<string> {
  const clientId = process.env.TOSSINVEST_CLIENT_ID?.trim();
  const clientSecret = process.env.TOSSINVEST_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new TossApiError("TOSSINVEST_CLIENT_ID / TOSSINVEST_CLIENT_SECRET 미설정", 503);
  }

  const now = Date.now();
  if (tokenCache && tokenCache.expiresAtMs > now + 60_000) {
    return tokenCache.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(`${baseUrl()}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { code?: string; message?: string; requestId?: string };
  };

  if (!res.ok || !json.access_token) {
    throw new TossApiError(
      json.error?.message || `토스 토큰 발급 실패 (${res.status})`,
      res.status,
      json.error?.code,
      json.error?.requestId
    );
  }

  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
  tokenCache = {
    accessToken: json.access_token,
    expiresAtMs: now + expiresIn * 1000,
  };
  return json.access_token;
}

export async function tossFetch<T>(
  path: string,
  init?: { searchParams?: Record<string, string | undefined>; retryAuth?: boolean }
): Promise<T> {
  const token = await fetchAccessToken();
  const url = new URL(`${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`);
  if (init?.searchParams) {
    for (const [k, v] of Object.entries(init.searchParams)) {
      if (v != null && v !== "") url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as T & {
    error?: { code?: string; message?: string; requestId?: string };
  };

  if (res.status === 401 && init?.retryAuth !== false) {
    tokenCache = null;
    return tossFetch<T>(path, { ...init, retryAuth: false });
  }

  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string; requestId?: string } }).error;
    throw new TossApiError(
      err?.message || `토스 API 오류 (${res.status})`,
      res.status,
      err?.code,
      err?.requestId
    );
  }

  return json as T;
}
