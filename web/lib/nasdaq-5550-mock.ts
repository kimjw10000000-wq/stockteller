/** Nasdaq Rule 5550 체크리스트 — 기본 정상(O) + SEC 파싱으로 상태 갱신 */

import type { CompanyAnalysisApiOk } from "@/lib/companies/analysis-types";
import type { ShelfCapacitySnapshot } from "@/lib/companies/registered-capacity";
import type { BidPriceNoticeHit } from "@/lib/sec/bid-price-deficiency-scan";
import type { ShelfRegistrationResult } from "@/lib/sec/shelf-registration-scan";

export type RuleCheckItem = {
  key: string;
  label: string;
  status: boolean;
  detail: string;
  /** 감지된 공시일 배열 (최신순). null = 아직 검색 전 */
  detectedDates: string[] | null;
  detectedNote?: string | null;
  filingUrl?: string | null;
  formType?: string | null;
};

export type Nasdaq5550Record = {
  ticker: string;
  companyName: string;
  rule5550a: {
    marketMakers: RuleCheckItem;
    bidPrice: RuleCheckItem;
    publicHolders: RuleCheckItem;
    publicShares: RuleCheckItem;
    marketValuePublic: RuleCheckItem;
  };
  rule5550b: {
    equity: RuleCheckItem;
    marketCap: RuleCheckItem;
    netIncome: RuleCheckItem;
  };
  /** (6) Shelf Registration / S-3·F-3 */
  offering: RuleCheckItem;
  shelfCapacity?: ShelfCapacitySnapshot | null;
};

function okItem(key: string, label: string, detail = "정상"): RuleCheckItem {
  return {
    key,
    label,
    status: true,
    detail,
    detectedDates: null,
    detectedNote: null,
  };
}

/** 검색 전·검색 직후 기본값: 전 항목 🟢 O */
export function createDefaultNasdaq5550Record(
  ticker = "—",
  companyName = "검색 대기 중"
): Nasdaq5550Record {
  return {
    ticker,
    companyName,
    rule5550a: {
      marketMakers: okItem(
        "marketMakers",
        "(1) 최소 2개 이상의 활동적 시장 조성자"
      ),
      bidPrice: okItem("bidPrice", "(2) 주당 최소 1달러의 최소 입찰 가격"),
      publicHolders: okItem("publicHolders", "(3) 최소 300명의 공공 주주"),
      publicShares: okItem(
        "publicShares",
        "(4) 최소 500,000주의 공개 유통 주식"
      ),
      marketValuePublic: okItem(
        "marketValuePublic",
        "(5) 공개 유통 주식 시가총액 $1,000,000 이상"
      ),
    },
    rule5550b: {
      equity: okItem("equity", "(1) 주주 지분 $2.5M (250만 달러) 이상"),
      marketCap: okItem(
        "marketCap",
        "(2) 상장 증권 시가총액 $35M (3,500만 달러) 이상"
      ),
      netIncome: okItem(
        "netIncome",
        "(3) 최근 회계연도/3년 중 2년 순이익 $500,000 이상"
      ),
    },
    offering: okItem(
      "offering",
      "(6) 오퍼링(유상증자) 가능성 (Shelf Registration / S-3 감지)",
      "검색 대기 중"
    ),
    shelfCapacity: null,
  };
}

export function applyShelfRegistration(
  record: Nasdaq5550Record,
  shelf: Pick<
    ShelfRegistrationResult,
    "hasS3" | "filingDate" | "filingDateTime" | "filingDateLabel" | "formType" | "filingUrl"
  >,
  /** Pre-formatted local label from the client, e.g. 2026년 07월 24일 05:15 (KST) */
  localDateTimeLabel?: string | null
): Nasdaq5550Record {
  if (!shelf.hasS3) {
    return {
      ...record,
      offering: {
        ...record.offering,
        status: true,
        detail: "최근 3년 내 S-3/F-3 공시 없음 (기습 오퍼링 가능성 낮음)",
        detectedDates: [],
        detectedNote: null,
        filingUrl: null,
        formType: null,
      },
    };
  }

  const label =
    localDateTimeLabel?.trim() ||
    shelf.filingDateTime ||
    shelf.filingDateLabel ||
    shelf.filingDate ||
    "—";
  return {
    ...record,
    offering: {
      ...record.offering,
      status: true,
      detail: "오퍼링 가능성 있음 (S-3/F-3 등록 완료)",
      detectedDates: [label],
      detectedNote: shelf.formType ? `${shelf.formType} 공시` : "Shelf Registration",
      filingUrl: shelf.filingUrl,
      formType: shelf.formType,
    },
  };
}

export function rule5550aItems(record: Nasdaq5550Record): RuleCheckItem[] {
  const a = record.rule5550a;
  return [a.marketMakers, a.bidPrice, a.publicHolders, a.publicShares, a.marketValuePublic];
}

export function rule5550bItems(record: Nasdaq5550Record): RuleCheckItem[] {
  const b = record.rule5550b;
  return [b.equity, b.marketCap, b.netIncome];
}

export function isRule5550aPass(record: Nasdaq5550Record): boolean {
  return rule5550aItems(record).every((item) => item.status);
}

export function isRule5550bPass(record: Nasdaq5550Record): boolean {
  return rule5550bItems(record).some((item) => item.status);
}

/** UI용 감지일 라벨 */
export function formatBidPriceDetectedLabel(item: RuleCheckItem): {
  datesLine: string;
  note: string | null;
  tone: "idle" | "clear" | "alert";
} {
  if (item.detectedDates === null) {
    return { datesLine: "검색 대기 중", note: null, tone: "idle" };
  }
  if (item.detectedDates.length === 0) {
    return {
      datesLine: item.key === "offering" ? "S-3/F-3 없음" : "위반 이력 없음",
      note: null,
      tone: "clear",
    };
  }
  return {
    datesLine: item.detectedDates.join(", "),
    note:
      item.detectedDates.length === 1
        ? item.detectedNote ?? null
        : `${item.detectedDates.length}건 포착`,
    tone: item.key === "offering" ? "alert" : "alert",
  };
}

/** Map DB-cached analysis API payload → checklist record */
export function applyCachedAnalysis(
  api: CompanyAnalysisApiOk,
  offeringLocalLabel?: string | null
): Nasdaq5550Record {
  let next = applyBidPriceHits(
    createDefaultNasdaq5550Record(api.ticker, api.companyName),
    api.bidPriceHits ?? []
  );
  next = applyShelfRegistration(
    next,
    {
      hasS3: api.hasOfferingRisk,
      filingDate: api.offeringFilingDateTime?.slice(0, 10) ?? null,
      filingDateTime: api.offeringFilingDateTime,
      filingDateLabel: offeringLocalLabel ?? api.offeringFilingDateTime,
      formType: api.offeringFormType,
      filingUrl: api.offeringFilingUrl,
    },
    offeringLocalLabel
  );
  next = applyShelfCapacity(next, api.shelfCapacity ?? null);
  return next;
}

export function applyShelfCapacity(
  record: Nasdaq5550Record,
  snap: ShelfCapacitySnapshot | null | undefined
): Nasdaq5550Record {
  if (!snap) return { ...record, shelfCapacity: null };
  const amount = snap.totalRegisteredOfferingCapacity ?? 0;
  const hasShelf = snap.isUnlimitedShelf || amount > 0;
  const asrForm = snap.filings.find(
    (f) => f.isActive && (f.formType === "S-3ASR" || f.formType === "F-3ASR")
  )?.formType;
  let detail: string;
  if (snap.isUnlimitedShelf) {
    detail = `무제한 (${asrForm || (snap.issuerType === "FOREIGN" ? "F-3ASR" : "S-3ASR")} 등록)`;
  } else if (hasShelf) {
    detail = `유효 선반 ${formatShelfUsd(amount)}`;
  } else {
    detail = "최근 3년 내 활성화된 S-1/S-3 선반 등록이 없습니다.";
  }
  return {
    ...record,
    shelfCapacity: snap,
    offering: {
      ...record.offering,
      status: true,
      detail,
      detectedDates: hasShelf
        ? snap.filings.filter((f) => f.isActive).map((f) => f.effectDate)
        : [],
      detectedNote: snap.isUnlimitedShelf ? "WKSI ASR" : hasShelf ? "선반 등록 유효" : null,
    },
  };
}

export function formatShelfUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n));
}

export function applyBidPriceHits(
  record: Nasdaq5550Record,
  hits: BidPriceNoticeHit[]
): Nasdaq5550Record {
  const sorted = [...hits].sort((a, b) => b.filingDate.localeCompare(a.filingDate));
  const dates = sorted.map((h) => h.filingDate);

  if (dates.length === 0) {
    return {
      ...record,
      rule5550a: {
        ...record.rule5550a,
        bidPrice: {
          ...record.rule5550a.bidPrice,
          status: true,
          detail: "최근 8개월 $1.00/$0.10 관련 공시 없음",
          detectedDates: [],
          detectedNote: null,
        },
      },
    };
  }

  const first = sorted[0];
  const note =
    dates.length === 1
      ? first.sourceLabel
      : `8-K Item 3.01 / 6-K 등 ${dates.length}건`;

  return {
    ...record,
    rule5550a: {
      ...record.rule5550a,
      bidPrice: {
        ...record.rule5550a.bidPrice,
        status: false,
        detail:
          dates.length === 1
            ? `SEC ${first.sourceLabel} — $1.00/$0.10 관련 공시 감지`
            : `SEC 공시 ${dates.length}건에서 $1.00/$0.10 관련 내용 감지`,
        detectedDates: dates,
        detectedNote: note,
      },
    },
  };
}

/** @deprecated use applyBidPriceHits */
export function applyBidPriceDeficiency(
  record: Nasdaq5550Record,
  filingDate: string,
  form: string
): Nasdaq5550Record {
  return applyBidPriceHits(record, [
    {
      filingDate,
      form,
      accessionNumber: "",
      sourceLabel: `${form} Item 3.01`,
      documentUrl: "",
      viewerUrl: "",
    },
  ]);
}
