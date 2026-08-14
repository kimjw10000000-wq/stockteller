import type { BidPriceNoticeHit } from "@/lib/sec/bid-price-deficiency-scan";
import type { ShelfCapacitySnapshot } from "@/lib/companies/registered-capacity";

export type Rule5550aStatus = {
  marketMakers: boolean;
  bidPrice: boolean;
  publicHolders: boolean;
  publicShares: boolean;
  marketValuePublic: boolean;
  bidPriceDetail: string;
  bidPriceFilingDates: string[];
};

export type CompanyAnalysisRow = {
  ticker: string;
  company_name: string | null;
  rule_5550a_status: Rule5550aStatus;
  has_offering_risk: boolean;
  offering_form_type: string | null;
  offering_filing_date: string | null;
  offering_filing_url: string | null;
  delisting_dday_type: string | null;
  delisting_dday_value: number | null;
  bid_price_hits: BidPriceNoticeHit[];
  last_analyzed_at: string;
  analysis_error: string | null;
};

export type CompanyAnalysisApiOk = {
  ok: true;
  source: "cache" | "fresh";
  ticker: string;
  companyName: string;
  lastAnalyzedAt: string;
  rule5550a: Rule5550aStatus;
  hasOfferingRisk: boolean;
  offeringFormType: string | null;
  offeringFilingDateTime: string | null;
  offeringFilingUrl: string | null;
  delistingDdayType: string | null;
  delistingDdayValue: number | null;
  bidPriceHits: BidPriceNoticeHit[];
  bidPriceFound: boolean;
  exchange?: string | null;
  marketCap?: number | null;
  cik?: string | null;
  primaryNewswire?: string | null;
  shelfCapacity?: ShelfCapacitySnapshot | null;
};

/** Nasdaq Rule 5550(a)(2) common cure window used for D-Day estimate */
export const BID_PRICE_GRACE_DAYS = 180;
