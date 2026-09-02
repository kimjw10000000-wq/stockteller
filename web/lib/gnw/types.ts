export type WireNewsAffiliation = "news" | "sec";

export type WireNewsRow = {
  id: string;
  source: string;
  external_id: string;
  url: string;
  title: string;
  teaser: string | null;
  summary: string | null;
  sentiment: string | null;
  analysis_score: number | null;
  tickers: string[];
  primary_ticker: string | null;
  company_name: string | null;
  published_at: string | null;
  created_at: string | null;
  market_cap: number | null;
  cap_bucket: "nano" | "micro" | string | null;
  language: string | null;
  llm_model: string | null;
  affiliation?: WireNewsAffiliation | null;
  newswire?: string | null;
  form_type?: string | null;
  accession?: string | null;
  original_title?: string | null;
  original_teaser?: string | null;
  original_summary?: string | null;
};

export function wireNewsAffiliation(item: WireNewsRow): WireNewsAffiliation {
  return item.affiliation === "sec" ? "sec" : "news";
}
