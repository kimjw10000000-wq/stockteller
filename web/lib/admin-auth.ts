/** Supabase Auth로 로그인 가능한 관리자 이메일 (쉼표·세미콜론·줄바꿈 구분) */

function normalizeEmail(raw: string): string {
  return raw
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .toLowerCase();
}

/** Vercel/로컬 env 값 정규화 (따옴표·BOM·여분 공백 제거) */
function normalizeAdminEmailsEnv(raw: string | undefined): string {
  if (!raw) return "";
  return raw.replace(/^\uFEFF/, "").trim();
}

export function getAdminEmails(): string[] {
  const raw = normalizeAdminEmailsEnv(process.env.ADMIN_EMAILS);
  if (!raw) return [];

  const emails = raw
    .split(/[,;\n]+/)
    .map((part) => normalizeEmail(part))
    .filter(Boolean);

  return Array.from(new Set(emails));
}

export type AdminEmailCheckResult = {
  ok: boolean;
  normalizedEmail: string | null;
  allowedEmails: string[];
  allowedConfigured: boolean;
};

export function checkAdminEmail(email: string | undefined | null): AdminEmailCheckResult {
  const normalizedEmail = email ? normalizeEmail(email) : null;
  const allowedEmails = getAdminEmails();
  const allowedConfigured = allowedEmails.length > 0;

  if (!normalizedEmail || !allowedConfigured) {
    return { ok: false, normalizedEmail, allowedEmails, allowedConfigured };
  }

  return {
    ok: allowedEmails.includes(normalizedEmail),
    normalizedEmail,
    allowedEmails,
    allowedConfigured,
  };
}

export function isAdminEmail(email: string | undefined | null): boolean {
  return checkAdminEmail(email).ok;
}

/** Vercel/서버 로그용 — 실패 원인 추적 */
export function logAdminAuthDebug(
  context: string,
  email: string | undefined | null,
  extra?: Record<string, unknown>
): void {
  const check = checkAdminEmail(email);
  const envRaw = normalizeAdminEmailsEnv(process.env.ADMIN_EMAILS);

  console.log(`[admin-auth] ${context}`, {
    incomingEmail: email ?? null,
    normalizedEmail: check.normalizedEmail,
    allowedConfigured: check.allowedConfigured,
    allowedCount: check.allowedEmails.length,
    allowedEmails: check.allowedEmails,
    envRawLength: envRaw.length,
    envRawPreview: envRaw ? `${envRaw.slice(0, 3)}…${envRaw.slice(-3)}` : "(empty)",
    matched: check.ok,
    ...extra,
  });
}
