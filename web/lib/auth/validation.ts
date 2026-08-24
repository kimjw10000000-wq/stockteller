export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (!value) return "이메일을 입력해 주세요.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "올바른 이메일 형식이 아닙니다.";
  return null;
}

import { hangulKeysToQwerty } from "@/lib/auth/password-keys";

/** 한글 자판 입력을 영문 키로 바꾼 뒤 ASCII만 남김 */
export function sanitizePasswordInput(raw: string): string {
  return hangulKeysToQwerty(raw).replace(/[^\x20-\x7E]/g, "");
}

export function validatePassword(password: string): string | null {
  if (/[^\x20-\x7E]/.test(password)) {
    return "비밀번호는 영문, 숫자, 기호만 사용할 수 있습니다.";
  }
  if (password.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "비밀번호는 영문과 숫자를 함께 써야 합니다.";
  }
  return null;
}

export const DUPLICATE_SIGNUP_EMAIL =
  "이미 회원가입된 이메일입니다. 로그인을 진행해 주세요.";

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
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }
  if (blob.includes("email not confirmed")) {
    return "이메일 인증이 아직 완료되지 않았습니다.";
  }
  if (blob.includes("otp_expired") || (blob.includes("expired") && blob.includes("otp"))) {
    return "인증번호가 만료되었습니다. 다시 받아 주세요.";
  }
  if (
    blob.includes("otp") &&
    (blob.includes("invalid") || blob.includes("token") || blob.includes("confirm"))
  ) {
    return "인증번호가 올바르지 않습니다.";
  }
  if (blob.includes("over_email_send_rate") || blob.includes("rate limit")) {
    return "인증 메일을 너무 자주 보냈습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (blob.includes("not authorized") || blob.includes("email_address_not_authorized")) {
    return "이 주소로는 인증 메일을 보낼 수 없습니다. Supabase에 Custom SMTP를 연결해야 합니다.";
  }
  if (
    blob.includes("error sending") ||
    blob.includes("magic link email") ||
    blob.includes("confirmation mail") ||
    blob.includes("unexpected_failure") ||
    message === "{}"
  ) {
    return "인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  return message || "요청을 처리하지 못했습니다.";
}

export function authCallbackUrl(next = "/"): string {
  const origin = window.location.origin;
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return `${origin}/auth/callback?next=${encodeURIComponent(safe)}`;
}

export const OTP_TTL_SEC = 180;
export const OTP_RESEND_SEC = 60;
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
