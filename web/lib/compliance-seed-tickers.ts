/** 상장폐지 D-Day 검색용 시드 (기존 유지 + append) */

export type ComplianceSeedTicker = {
  ticker: string;
  companyName: string;
};

/** 기존 시드 — 삭제·교체하지 않음 */
const SEED_BASE: ComplianceSeedTicker[] = [
  { ticker: "FFAI", companyName: "Faraday Future Intelligent Electric Inc." },
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

/** 이미지1 append (20) */
const SEED_APPEND_B: ComplianceSeedTicker[] = [
  { ticker: "BIRD", companyName: "Smartbird Inc" },
  { ticker: "BIVI", companyName: "BioVie Inc" },
  { ticker: "BJDX", companyName: "Bluejay Diagnostics Inc" },
  { ticker: "BKYI", companyName: "Bio-Key International Inc" },
  { ticker: "BLIN", companyName: "Bridgeline Digital Inc" },
  { ticker: "BLNE", companyName: "Beeline Holdings Inc" },
  { ticker: "BMRA", companyName: "Biomerica Inc" },
  { ticker: "BNGO", companyName: "Bionano Genomics Inc" },
  { ticker: "BNKK", companyName: "Bonk Inc" },
  { ticker: "BNZI", companyName: "Banzai International Inc" },
  { ticker: "BOLT", companyName: "Bolt Biotherapeutics Inc" },
  { ticker: "BOXL", companyName: "Boxlight Corp" },
  { ticker: "BRFH", companyName: "Barfresh Food Group Inc" },
  { ticker: "BRN", companyName: "Barnwell Industries Inc" },
  { ticker: "BRTX", companyName: "BioRestorative Therapies Inc" },
  { ticker: "BTAI", companyName: "BioXcel Therapeutics Inc" },
  { ticker: "BTBD", companyName: "BT Brands Inc" },
  { ticker: "BTCS", companyName: "BTCS Inc" },
  { ticker: "BTOC", companyName: "Armlogi Holding Corp" },
  { ticker: "BXBL", companyName: "BOXABL Inc" },
];

/** 이미지2 append (20) — FFAI는 기존 시드에 있으므로 제외 */
const SEED_APPEND_E_F: ComplianceSeedTicker[] = [
  { ticker: "ESLA", companyName: "Estrella Immunopharma Inc" },
  { ticker: "EXOZ", companyName: "eXoZymes Inc" },
  { ticker: "EXYN", companyName: "Exyn Technologies Inc" },
  { ticker: "EZRA", companyName: "Reliance Global Group Inc" },
  { ticker: "FABC", companyName: "Fabric.AI Inc" },
  { ticker: "FBGL", companyName: "FBS Global Ltd" },
  { ticker: "FBLG", companyName: "FibroBiologics Inc" },
  { ticker: "FCUV", companyName: "Focus Universal Inc" },
  { ticker: "FEAM", companyName: "5E Advanced Materials Inc" },
  { ticker: "FEED", companyName: "ENvue Medical Inc" },
  { ticker: "FEMY", companyName: "Femasys Inc" },
  { ticker: "FGI", companyName: "FGI Industries Ltd" },
  { ticker: "FGNX", companyName: "FG Nexus Inc" },
  { ticker: "FKWL", companyName: "Franklin Wireless Corp" },
  { ticker: "FLD", companyName: "Fold Holdings Inc" },
  { ticker: "FLNA", companyName: "Filana Therapeutics Inc" },
  { ticker: "FLUX", companyName: "Flux Power Holdings Inc" },
  { ticker: "FLYE", companyName: "Fly-E Group Inc" },
  { ticker: "FMFC", companyName: "Kandal M Venture Ltd" },
];

function mergeUnique(...lists: ComplianceSeedTicker[][]): ComplianceSeedTicker[] {
  const map = new Map<string, ComplianceSeedTicker>();
  for (const list of lists) {
    for (const row of list) {
      const key = row.ticker.toUpperCase();
      if (!map.has(key)) map.set(key, { ...row, ticker: key });
    }
  }
  return Array.from(map.values());
}

export const COMPLIANCE_SEED_TICKERS: ComplianceSeedTicker[] = mergeUnique(
  SEED_BASE,
  SEED_APPEND_B,
  SEED_APPEND_E_F
);

const BY_TICKER = new Map(
  COMPLIANCE_SEED_TICKERS.map((row) => [row.ticker.toUpperCase(), row] as const)
);

export function getComplianceSeedTicker(ticker: string): ComplianceSeedTicker | null {
  return BY_TICKER.get(ticker.trim().toUpperCase()) ?? null;
}

export function isComplianceSeedTicker(ticker: string): boolean {
  return BY_TICKER.has(ticker.trim().toUpperCase());
}
