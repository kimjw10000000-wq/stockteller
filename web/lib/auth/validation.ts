export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (!value) return "이메일을 입력해 주세요.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "올바른 이메일 형식이 아닙니다.";
  return null;
}

/** 최소 8자, 영문 + 숫자 */
export function validatePassword(password: string): string | null {
  if (password.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "비밀번호는 영문과 숫자를 함께 써야 합니다.";
  }
  return null;
}

export function isDuplicateEmailError(message: string, code?: string): boolean {
  const blob = `${code ?? ""} ${message}`.toLowerCase();
  return (
    blob.includes("user_already_exists") ||
    blob.includes("already registered") ||
    blob.includes("already been registered") ||
    blob.includes("email address is already")
  );
}

export function mapAuthError(message: string, code?: string): string {
  if (isDuplicateEmailError(message, code)) {
    return "이미 가입된 이메일입니다. 로그인하거나 비밀번호 찾기를 이용해 주세요.";
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
  return message || "요청을 처리하지 못했습니다.";
}

export function authCallbackUrl(next = "/"): string {
  const origin = window.location.origin;
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return `${origin}/auth/callback?next=${encodeURIComponent(safe)}`;
}

export const OTP_TTL_SEC = 180;
export const AUTH_HOME = "/feed";
