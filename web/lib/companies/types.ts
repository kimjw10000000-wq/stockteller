export type UsListedCompany = {
  ticker: string;
  name: string;
  market_cap: number | null;
  cik: string;
  exchange: string;
  primary_newswire?: string | null;
  updated_at?: string;
  market_cap_updated_at?: string | null;
  newswire_updated_at?: string | null;
};

export type UsListedCompanyRow = {
  ticker: string;
  name: string;
  market_cap: number | null;
  cik: string;
  exchange: string;
  primary_newswire: string | null;
  updated_at: string;
  market_cap_updated_at: string | null;
  newswire_updated_at: string | null;
};
