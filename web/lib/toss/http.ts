import { NextResponse } from "next/server";
import { isTossConfigured, TossApiError } from "./client";

export function tossNotConfiguredResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: "TOSSINVEST_CLIENT_ID / TOSSINVEST_CLIENT_SECRET 미설정",
      configured: false,
    },
    { status: 503 }
  );
}

export function requireTossOr503() {
  if (!isTossConfigured()) return tossNotConfiguredResponse();
  return null;
}

export function tossErrorResponse(e: unknown, logLabel: string) {
  const err = e as TossApiError;
  const message = e instanceof Error ? e.message : String(e);
  console.error(`[${logLabel}]`, message, {
    code: err?.code,
    status: err?.httpStatus,
    path: err?.path,
    requestId: err?.requestId,
  });
  const status =
    typeof err?.httpStatus === "number" && err.httpStatus >= 400 && err.httpStatus < 600
      ? err.httpStatus
      : 500;
  return NextResponse.json(
    {
      ok: false,
      error: message,
      code: err?.code,
      requestId: err?.requestId,
      path: err?.path,
      configured: isTossConfigured(),
      fetchedAt: new Date().toISOString(),
    },
    { status }
  );
}

export function tossOk<T extends Record<string, unknown>>(body: T, init?: { status?: number }) {
  return NextResponse.json(
    {
      ok: true,
      configured: true,
      source: "toss",
      fetchedAt: new Date().toISOString(),
      ...body,
    },
    { status: init?.status ?? 200 }
  );
}
