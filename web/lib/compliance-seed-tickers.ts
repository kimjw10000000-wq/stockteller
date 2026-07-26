/** 상장폐지 D-Day 검색용 초기 시드 (20종목) */

export type ComplianceSeedTicker = {
  ticker: string;
  companyName: string;
};

export const COMPLIANCE_SEED_TICKERS: ComplianceSeedTicker[] = [
  { ticker: "AAME", companyName: "Atlantic American Corp" },
  { ticker: "ABVC", companyName: "ABVC BioPharma Inc" },
  { ticker: "ACCS", companyName: "ACCESS Newswire Inc" },
  { ticker: "ACON", companyName: "Aclarion Inc" },
  { ticker: "ACTU", companyName: "Actuate Therapeutics Inc" },
  { ticker: "ACXP", companyName: "Acurx Pharmaceuticals Inc" },
  { ticker: "ADGM", companyName: "Adagio Medical Holdings Inc" },
  { ticker: "ADIL", companyName: "Adial Pharmaceuticals Inc" },
  { ticker: "AEI", companyName: "Alset Inc" },
  { ticker: "AEMD", companyName: "Aethlon Medical Inc" },
  { ticker: "AEON", companyName: "AEON Biopharma Inc" },
  { ticker: "AFJK", companyName: "Aimei Health Technology Co Ltd" },
  { ticker: "AGIG", companyName: "Abundia Global Impact Group Inc" },
  { ticker: "AHT", companyName: "Ashford Hospitality Trust Inc" },
  { ticker: "AIDX", companyName: "20/20 Biolabs Inc" },
  { ticker: "AIFA", companyName: "All InFutureTech Alliance Inc" },
  { ticker: "AIFF", companyName: "Firefly Neuroscience Inc" },
  { ticker: "AIM", companyName: "AIM ImmunoTech Inc" },
  { ticker: "AIMD", companyName: "Ainos Inc" },
  { ticker: "AIRE", companyName: "reAlpha Tech Corp" },
];

const BY_TICKER = new Map(
  COMPLIANCE_SEED_TICKERS.map((row) => [row.ticker.toUpperCase(), row] as const)
);

export function getComplianceSeedTicker(ticker: string): ComplianceSeedTicker | null {
  return BY_TICKER.get(ticker.trim().toUpperCase()) ?? null;
}

export function isComplianceSeedTicker(ticker: string): boolean {
  return BY_TICKER.has(ticker.trim().toUpperCase());
}
