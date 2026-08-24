export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (!value) return "auth.emailRequired";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "auth.emailInvalid";
  return null;
}

import { hangulKeysToQwerty } from "@/lib/auth/password-keys";

/** 한글 자판 입력을 영문 키로 바꾼 뒤 ASCII만 남김 */
export function sanitizePasswordInput(raw: string): string {
  return hangulKeysToQwerty(raw).replace(/[^\x20-\x7E]/g, "");
}

export function validatePassword(password: string): string | null {
  if (/[^\x20-\x7E]/.test(password)) {
    return "auth.passwordAscii";
  }
  if (password.length < 8) return "auth.passwordLength";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "auth.passwordMix";
  }
  return null;
}

export const DUPLICATE_SIGNUP_EMAIL = "auth.duplicateEmail";

export function isDuplicateEmailError(message: string, code?: string): boolean {
  const blob = `${code ?? ""} ${message}`.toLowerCase();
  return (
    blob.includes("user_already_exists") ||
    blob.includes("already registered") ||
    blob.includes("already been registered") ||
    blob.includes("email address is already") ||
    message === DUPLICATE_SIGNUP_EMAIL
  );
}

export function mapAuthError(message: string, code?: string): string {
  if (isDuplicateEmailError(message, code)) {
    return DUPLICATE_SIGNUP_EMAIL;
  }
  const blob = `${code ?? ""} ${message}`.toLowerCase();
  if (blob.includes("invalid login") || blob.includes("invalid credentials")) {
    return "auth.invalidCredentials";
  }
  if (blob.includes("email not confirmed")) {
    return "auth.emailNotConfirmed";
  }
  if (blob.includes("otp_expired") || (blob.includes("expired") && blob.includes("otp"))) {
    return "auth.otpExpired";
  }
  if (
    blob.includes("otp") &&
    (blob.includes("invalid") || blob.includes("token") || blob.includes("confirm"))
  ) {
    return "auth.otpInvalid";
  }
  if (blob.includes("over_email_send_rate") || blob.includes("rate limit")) {
    return "auth.rateLimited";
  }
  if (blob.includes("not authorized") || blob.includes("email_address_not_authorized")) {
    return "auth.emailNotAuthorized";
  }
  if (
    blob.includes("error sending") ||
    blob.includes("magic link email") ||
    blob.includes("confirmation mail") ||
    blob.includes("unexpected_failure") ||
    message === "{}"
  ) {
    return "auth.mailFailed";
  }
  return message || "auth.generic";
}

export function authCallbackUrl(next = "/"): string {
  const origin = window.location.origin;
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return `${origin}/auth/callback?next=${encodeURIComponent(safe)}`;
}

export const OTP_TTL_SEC = 180;
/** 서버 OTP 이메일 쿨다운과 맞춤 (3분) */
export const OTP_RESEND_SEC = 180;
export const OTP_LENGTH = 8;
export const OTP_PLACEHOLDER = "-".repeat(OTP_LENGTH);
export const RECOVERY_OTP_LENGTH = 8;
export const RECOVERY_OTP_PLACEHOLDER = "-".repeat(RECOVERY_OTP_LENGTH);
export const AUTH_HOME = "/feed";

/** Open-redirect 방지. 사이트 내부 경로만 허용. */
export function safeInternalPath(raw: string | undefined | null, fallback = AUTH_HOME): string {
  if (!raw) return fallback;
  const next = raw.trim();
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("://") || next.includes("\\")) {
    return fallback;
  }
  return next;
}
