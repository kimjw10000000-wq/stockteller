/** Nasdaq Rule 5550 mock — DB 연동 전 테스트용 */

export type RuleCheckItem = {
  label: string;
  status: boolean;
  detail: string;
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

export const mockData: Nasdaq5550Record = {
  ticker: "FFAI",
  companyName: "Faraday Future Intelligent Electric Inc.",
  rule5550a: {
    marketMakers: {
      label: "최소 2개 이상의 활동적 시장 조성자",
      status: true,
      detail: "현재 4개",
    },
    bidPrice: {
      label: "주당 최소 $1.00 이상 입찰 가격",
      status: false,
      detail: "현재 $0.35 (위반)",
    },
    publicHolders: {
      label: "최소 300명의 공공 주주",
      status: true,
      detail: "300명 이상 만족",
    },
    publicShares: {
      label: "최소 500,000주의 공개 유통 주식",
      status: true,
      detail: "조건 충족",
    },
    marketValuePublic: {
      label: "공개 유통 주식 시가총액 $1,000,000 이상",
      status: true,
      detail: "$1.2M 충족",
    },
  },
  rule5550b: {
    equity: {
      label: "(1) 주주 지분 $2.5M (250만 달러) 이상",
      status: false,
      detail: "-$5M (미달)",
    },
    marketCap: {
      label: "(2) 상장 증권 시가총액 $35M (3,500만 달러) 이상",
      status: false,
      detail: "$12M (미달)",
    },
    netIncome: {
      label: "(3) 최근 회계연도/3년 중 2년 순이익 $500,000 이상",
      status: false,
      detail: "적자 지속 (미달)",
    },
  },
};

const MOCK_DB: Record<string, Nasdaq5550Record> = {
  [mockData.ticker]: mockData,
};

export function lookupNasdaq5550(ticker: string): Nasdaq5550Record | null {
  const key = ticker.trim().toUpperCase();
  if (!key) return null;
  return MOCK_DB[key] ?? null;
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
