export type UsListedCompany = {
  ticker: string;
  name: string;
  market_cap: number | null;
  cik: string;
  exchange: string;
  updated_at?: string;
  market_cap_updated_at?: string | null;
};

export type UsListedCompanyRow = {
  ticker: string;
  name: string;
  market_cap: number | null;
  cik: string;
  exchange: string;
  updated_at: string;
  market_cap_updated_at: string | null;
};
