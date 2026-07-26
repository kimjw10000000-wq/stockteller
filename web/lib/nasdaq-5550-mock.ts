/** Nasdaq Rule 5550 체크리스트 — 기본 정상(O) + SEC 파싱으로 상태 갱신 */

export type RuleCheckItem = {
  key: string;
  label: string;
  status: boolean;
  detail: string;
  /** 감지된 공시일 (YYYY-MM-DD) — 없으면 검색 대기/빈칸 */
  detectedDate: string | null;
  detectedNote?: string | null;
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
};

function okItem(key: string, label: string, detail = "정상"): RuleCheckItem {
  return {
    key,
    label,
    status: true,
    detail,
    detectedDate: null,
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
  };
}

/** @deprecated mock 조회 — 호환용. FFAI만 회사명 힌트 */
export const mockData = createDefaultNasdaq5550Record(
  "FFAI",
  "Faraday Future Intelligent Electric Inc."
);

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

export function applyBidPriceDeficiency(
  record: Nasdaq5550Record,
  filingDate: string,
  form: string
): Nasdaq5550Record {
  return {
    ...record,
    rule5550a: {
      ...record.rule5550a,
      bidPrice: {
        ...record.rule5550a.bidPrice,
        status: false,
        detail: `SEC ${form} Item 3.01 — 최소 입찰가 $1.00 미달 통지 감지`,
        detectedDate: filingDate,
        detectedNote: `${form} Item 3.01`,
      },
    },
  };
}
