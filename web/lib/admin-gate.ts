const GATE_SALT = "whyup_admin_gate_v1";

/** HttpOnly 쿠키에 넣을 값(원 비밀번호 노출 없음). Edge·Node 공통 Web Crypto. */
export async function adminGateCookieValue(adminSecret: string): Promise<string> {
  const payload = `${adminSecret}:${GATE_SALT}`;
  const data = new TextEncoder().encode(payload);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}
