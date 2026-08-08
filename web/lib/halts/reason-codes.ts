/** NASDAQ Trade Halt reason codes (common subset). */
export const HALT_REASON_CODES: Record<string, string> = {
  T1: "뉴스 대기 (News Pending)",
  T2: "뉴스 발표 중 (News Released)",
  T3: "뉴스 공시 완료 · 재개 시각 공지",
  T5: "단일주 거래 일시정지 (LULD Pause)",
  T6: "규제 관련 정지",
  T8: "교환 관련",
  T12: "추가 정보 요청 / 규제",
  H10: "SEC 거래 정지",
  H11: "기타 규제 당국 정지",
  H12: "상장 관련",
  C3: "자격 요건 미충족",
  C4: "자격 요건 충족 · 재개",
  C9: "자격/서류 충족 · 호가·거래 재개",
  C11: "타 규제기관 정지 종료 · 재개",
  M1: "시장 전체 관련",
  LUDP: "변동성 정지 (LULD Pause)",
  LUDS: "Limit Up-Limit Down Straddle",
};

export function haltReasonLabel(code: string): string {
  const c = code.trim().toUpperCase();
  return HALT_REASON_CODES[c] ?? `사유 코드 ${c}`;
}
