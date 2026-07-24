/** Admin · 상장유지 D-Day 관리 (UI용 타입·상수) */

export type ComplianceGraceStatus =
  | "grace_180"
  | "hearing"
  | "limit_250"
  | "cleared";

export const COMPLIANCE_GRACE_OPTIONS: {
  value: ComplianceGraceStatus;
  label: string;
}[] = [
  { value: "grace_180", label: "180일 유예 중" },
  { value: "hearing", label: "청문회 신청/대기 중" },
  { value: "limit_250", label: "250대1 한도 초과" },
  { value: "cleared", label: "정상/해제" },
];

export type ComplianceWatchItem = {
  id: string;
  ticker: string;
  stockName: string;
  noticeDate: string; // YYYY-MM-DD
  ddayDate: string; // YYYY-MM-DD (만료·기준일)
  status: ComplianceGraceStatus;
  updatedAt: string; // ISO
};

export function graceLabel(status: ComplianceGraceStatus): string {
  return COMPLIANCE_GRACE_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

/** noticeDate + days → YYYY-MM-DD (UTC 날짜 기준) */
export function addDaysIso(isoDate: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** D-Day까지 남은 일수 (오늘 기준, 만료일 당일 = 0) */
export function daysUntil(isoDate: string, today = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return null;
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - start) / 86_400_000);
}

/** UI 미리보기용 샘플 (백엔드 연동 전) */
export const COMPLIANCE_SAMPLE_ITEMS: ComplianceWatchItem[] = [
  {
    id: "sample-sdot",
    ticker: "SDOT",
    stockName: "Sadot Group",
    noticeDate: "2026-02-10",
    ddayDate: "2026-08-09",
    status: "grace_180",
    updatedAt: "2026-07-20T09:00:00.000Z",
  },
  {
    id: "sample-muln",
    ticker: "MULN",
    stockName: "Mullen Automotive",
    noticeDate: "2026-03-01",
    ddayDate: "2026-08-28",
    status: "hearing",
    updatedAt: "2026-07-18T12:30:00.000Z",
  },
  {
    id: "sample-ffie",
    ticker: "FFIE",
    stockName: "Faraday Future",
    noticeDate: "2025-12-15",
    ddayDate: "2026-06-13",
    status: "limit_250",
    updatedAt: "2026-07-10T08:00:00.000Z",
  },
];
