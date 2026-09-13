/** Nasdaq Security Name → issuer name for EDGAR match. */

const SECURITY_TAIL =
  /\s*[-–—]\s*(common stock|ordinary shares?|american depositary shares?|ads|adr|warrants?|units?|rights?|preferred stock|preference shares?|class [a-z] common stock)(\s+.*)?$/i;

export function issuerNameKey(raw: string): string {
  let s = String(raw ?? "").trim();
  s = s.replace(/\s*\(CIK\s*\d+\)\s*$/i, "");
  s = s.replace(/\s*\([A-Z][A-Z0-9.$]{0,10}\)\s*$/g, "");
  s = s.replace(SECURITY_TAIL, "");
  s = s.replace(/[.,']/g, " ");
  return s.replace(/\s+/g, " ").trim().toUpperCase();
}

export function issuerNamesEqual(a: string, b: string): boolean {
  const left = issuerNameKey(a);
  const right = issuerNameKey(b);
  return Boolean(left && right && left === right);
}
