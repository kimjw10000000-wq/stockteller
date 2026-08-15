import {
  isActiveEffectDate,
  normalizeSecFileNumber,
  type FilingStatus,
} from "@/lib/sec/offering-amount-parse";

export type ShelfRolloverInput = {
  cik: string;
  fileNumber: string;
  priorFileNumbers: string[];
  isActive: boolean;
  status: FilingStatus;
  replacedByFileNumber: string | null;
  formType: string;
  parseMethod: string | null;
  maxOfferingAmount: number | null;
  effectDate: string;
};

/**
 * Rule 415(a)(6): within a single CIK, a successor shelf that cites
 * Prior Registration No. retires the predecessor. Never crosses CIKs.
 */
export function applyShelfRollover<T extends ShelfRolloverInput>(
  drafts: T[]
): Array<T & { status: FilingStatus }> {
  const copies = drafts.map((d) => ({ ...d, priorFileNumbers: [...d.priorFileNumbers] }));
  const byCikFile = new Map<string, T>();
  for (const d of copies) {
    const file = normalizeSecFileNumber(d.fileNumber) ?? d.fileNumber.trim();
    byCikFile.set(`${d.cik}::${file}`, d);
  }

  for (const successor of copies) {
    const successorFile = normalizeSecFileNumber(successor.fileNumber) ?? successor.fileNumber.trim();
    for (const raw of successor.priorFileNumbers) {
      const prior = normalizeSecFileNumber(raw);
      if (!prior || prior === successorFile) continue;
      const old = byCikFile.get(`${successor.cik}::${prior}`);
      if (!old) continue;
      old.isActive = false;
      old.status = "REPLACED";
      old.replacedByFileNumber = successorFile;
    }
  }

  return copies;
}

export function isWksiAsrDraft(row: {
  formType: string;
  parseMethod: string | null;
}): boolean {
  return (
    row.formType === "S-3ASR" ||
    row.formType === "F-3ASR" ||
    row.parseMethod === "wksi_asr"
  );
}

/** CIK-scoped live capacity. Replaced / expired rows must already have isActive=false. */
export function sumActiveShelfCapacity(
  filings: Array<{
    cik: string;
    isActive: boolean;
    status: FilingStatus;
    formType: string;
    parseMethod: string | null;
    maxOfferingAmount: number | null;
    effectDate: string;
  }>,
  cik: string,
  nowMs = Date.now()
): { isUnlimitedShelf: boolean; total: number | null } {
  const mine = filings.filter((f) => f.cik === cik);
  const live = mine.filter(
    (f) =>
      f.status !== "REPLACED" &&
      f.isActive &&
      isActiveEffectDate(f.effectDate, nowMs)
  );
  if (live.some(isWksiAsrDraft)) {
    return { isUnlimitedShelf: true, total: null };
  }
  const total = live
    .filter((f) => f.maxOfferingAmount != null)
    .reduce((sum, f) => sum + Number(f.maxOfferingAmount), 0);
  return { isUnlimitedShelf: false, total };
}
