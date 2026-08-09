import { NextResponse } from "next/server";
import type {
  CompanyAnalysisApiOk,
  CompanyAnalysisRow,
} from "@/lib/companies/analysis-types";
import {
  analyzeAndCacheCompany,
  getCachedAnalysis,
} from "@/lib/companies/analyze-company";
import { getUsListedCompany } from "@/lib/companies/search";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function rowToApi(
  row: CompanyAnalysisRow,
  source: "cache" | "fresh",
  meta?: {
    exchange?: string | null;
    marketCap?: number | null;
    cik?: string | null;
    primaryNewswire?: string | null;
  }
): CompanyAnalysisApiOk {
  const rule = row.rule_5550a_status;
  return {
    ok: true,
    source,
    ticker: row.ticker,
    companyName: row.company_name ?? row.ticker,
    lastAnalyzedAt: row.last_analyzed_at,
    rule5550a: rule,
    hasOfferingRisk: row.has_offering_risk,
    offeringFormType: row.offering_form_type,
    offeringFilingDateTime: row.offering_filing_date,
    offeringFilingUrl: row.offering_filing_url,
    delistingDdayType: row.delisting_dday_type,
    delistingDdayValue: row.delisting_dday_value,
    bidPriceHits: row.bid_price_hits ?? [],
    bidPriceFound: !(rule?.bidPrice ?? true),
    exchange: meta?.exchange ?? null,
    marketCap: meta?.marketCap ?? null,
    cik: meta?.cik ?? null,
    primaryNewswire: meta?.primaryNewswire ?? null,
  };
}

export async function GET(req: Request) {
  const ticker = new URL(req.url).searchParams.get("ticker")?.trim() ?? "";
  if (!ticker) {
    return NextResponse.json({ ok: false, error: "ticker 쿼리가 필요합니다." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const company = await getUsListedCompany(admin, ticker).catch(() => null);
    const meta = company
      ? {
          exchange: company.exchange,
          marketCap: company.market_cap,
          cik: company.cik,
          primaryNewswire: company.primary_newswire,
        }
      : undefined;

    const cached = await getCachedAnalysis(admin, ticker);
    if (cached && !cached.analysis_error) {
      return NextResponse.json(rowToApi(cached, "cache", meta));
    }

    // Cache miss (or prior error): one-shot EDGAR analyze + upsert
    const fresh = await analyzeAndCacheCompany(admin, ticker);
    return NextResponse.json(rowToApi(fresh, "fresh", meta));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[compliance/analysis]", message);
    const status = /찾을 수 없|not found|조회할 수 없/i.test(message) ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
