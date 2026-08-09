import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BID_PRICE_GRACE_DAYS,
  type CompanyAnalysisRow,
  type Rule5550aStatus,
} from "./analysis-types";
import { getUsListedCompany } from "./search";
import { scanBidPriceDeficiencyNotice } from "@/lib/sec/bid-price-deficiency-scan";
import { scanShelfRegistration } from "@/lib/sec/shelf-registration-scan";

function defaultRule5550a(bidPricePass: boolean, detail: string, dates: string[]): Rule5550aStatus {
  return {
    marketMakers: true,
    bidPrice: bidPricePass,
    publicHolders: true,
    publicShares: true,
    marketValuePublic: true,
    bidPriceDetail: detail,
    bidPriceFilingDates: dates,
  };
}

function computeBidPriceDday(latestFilingIsoDate: string | null): {
  type: string | null;
  value: number | null;
} {
  if (!latestFilingIsoDate) return { type: null, value: null };
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(latestFilingIsoDate);
  if (!m) return { type: "$1미만", value: null };
  const start = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const deadline = start + BID_PRICE_GRACE_DAYS * 86_400_000;
  const days = Math.ceil((deadline - Date.now()) / 86_400_000);
  return { type: "$1미만", value: days };
}

export async function getCachedAnalysis(
  admin: SupabaseClient,
  ticker: string
): Promise<CompanyAnalysisRow | null> {
  const t = ticker.trim().toUpperCase().replace(/\./g, "-");
  const { data, error } = await admin
    .from("company_analysis_results")
    .select("*")
    .eq("ticker", t)
    .maybeSingle();
  if (error) {
    if (error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message)) {
      return null;
    }
    throw new Error(error.message);
  }
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    ticker: String(row.ticker),
    company_name: (row.company_name as string | null) ?? null,
    rule_5550a_status: (row.rule_5550a_status as Rule5550aStatus) ?? defaultRule5550a(true, "정상", []),
    has_offering_risk: Boolean(row.has_offering_risk),
    offering_form_type: (row.offering_form_type as string | null) ?? null,
    offering_filing_date: (row.offering_filing_date as string | null) ?? null,
    offering_filing_url: (row.offering_filing_url as string | null) ?? null,
    delisting_dday_type: (row.delisting_dday_type as string | null) ?? null,
    delisting_dday_value: (row.delisting_dday_value as number | null) ?? null,
    bid_price_hits: Array.isArray(row.bid_price_hits) ? row.bid_price_hits : [],
    last_analyzed_at: String(row.last_analyzed_at ?? new Date().toISOString()),
    analysis_error: (row.analysis_error as string | null) ?? null,
  };
}

export async function upsertAnalysis(
  admin: SupabaseClient,
  row: Omit<CompanyAnalysisRow, "last_analyzed_at"> & { last_analyzed_at?: string }
): Promise<void> {
  const payload = {
    ...row,
    last_analyzed_at: row.last_analyzed_at ?? new Date().toISOString(),
  };
  const { error } = await admin.from("company_analysis_results").upsert(payload, {
    onConflict: "ticker",
  });
  if (error) throw new Error(`company_analysis_results upsert: ${error.message}`);
}

/**
 * Run live EDGAR scans (bid-price + shelf) and persist to company_analysis_results.
 */
export async function analyzeAndCacheCompany(
  admin: SupabaseClient,
  tickerInput: string
): Promise<CompanyAnalysisRow> {
  const ticker = tickerInput.trim().toUpperCase().replace(/\./g, "-");
  const company = await getUsListedCompany(admin, ticker).catch(() => null);

  const [bid, shelf] = await Promise.all([
    scanBidPriceDeficiencyNotice(ticker),
    scanShelfRegistration(ticker),
  ]);

  if (!bid.ok && !shelf.ok) {
    const err = !bid.ok ? bid.error : "분석 실패";
    const failed: CompanyAnalysisRow = {
      ticker,
      company_name: company?.name ?? null,
      rule_5550a_status: defaultRule5550a(true, "분석 실패", []),
      has_offering_risk: false,
      offering_form_type: null,
      offering_filing_date: null,
      offering_filing_url: null,
      delisting_dday_type: null,
      delisting_dday_value: null,
      bid_price_hits: [],
      last_analyzed_at: new Date().toISOString(),
      analysis_error: err,
    };
    try {
      await upsertAnalysis(admin, failed);
    } catch {
      /* table may be missing */
    }
    throw new Error(err);
  }

  const companyName =
    company?.name ||
    (bid.ok ? bid.companyName : null) ||
    (shelf.ok ? shelf.companyName : null) ||
    ticker;

  const hits = bid.ok ? bid.hits : [];
  const dates = bid.ok ? bid.filingDates : [];
  const bidPass = !(bid.ok && bid.found);
  const bidDetail =
    bid.ok && bid.found
      ? dates.length === 1
        ? `SEC ${hits[0]?.sourceLabel ?? "공시"} — $1.00/$0.10 관련 공시 감지`
        : `SEC 공시 ${dates.length}건에서 $1.00/$0.10 관련 내용 감지`
      : "최근 8개월 $1.00/$0.10 관련 공시 없음";

  const dday = bidPass ? { type: null, value: null } : computeBidPriceDday(dates[0] ?? null);

  const shelfOk = shelf.ok ? shelf : null;
  const hasOffering = Boolean(shelfOk?.hasS3);
  const row: CompanyAnalysisRow = {
    ticker,
    company_name: companyName,
    rule_5550a_status: defaultRule5550a(bidPass, bidDetail, dates),
    has_offering_risk: hasOffering,
    offering_form_type: hasOffering ? shelfOk?.formType ?? null : null,
    offering_filing_date: hasOffering ? shelfOk?.filingDateTime ?? null : null,
    offering_filing_url: hasOffering ? shelfOk?.filingUrl ?? null : null,
    delisting_dday_type: dday.type,
    delisting_dday_value: dday.value,
    bid_price_hits: hits,
    last_analyzed_at: new Date().toISOString(),
    analysis_error: !bid.ok ? bid.error : !shelf.ok ? shelf.error : null,
  };

  await upsertAnalysis(admin, row);
  return row;
}

/** Batch: prefer never-analyzed, then oldest last_analyzed_at */
export async function analyzeCompanyBatch(
  admin: SupabaseClient,
  limit = 5
): Promise<{ attempted: number; ok: number; errors: string[] }> {
  const safe = Math.min(Math.max(limit, 1), 20);
  const errors: string[] = [];
  let ok = 0;
  const tickers: string[] = [];

  const { data: analyzed } = await admin
    .from("company_analysis_results")
    .select("ticker")
    .limit(50_000);
  const analyzedSet = new Set(
    (analyzed ?? []).map((r) => String((r as { ticker: string }).ticker))
  );

  const { data: companies } = await admin
    .from("us_listed_companies")
    .select("ticker")
    .order("updated_at", { ascending: true })
    .limit(500);

  for (const r of companies ?? []) {
    const t = String((r as { ticker: string }).ticker);
    if (!analyzedSet.has(t)) tickers.push(t);
    if (tickers.length >= safe) break;
  }

  if (tickers.length < safe) {
    const { data: stale } = await admin
      .from("company_analysis_results")
      .select("ticker")
      .order("last_analyzed_at", { ascending: true })
      .limit(safe);
    for (const r of stale ?? []) {
      const t = String((r as { ticker: string }).ticker);
      if (!tickers.includes(t)) tickers.push(t);
      if (tickers.length >= safe) break;
    }
  }

  for (const t of tickers.slice(0, safe)) {
    try {
      await analyzeAndCacheCompany(admin, t);
      ok += 1;
    } catch (e) {
      errors.push(`${t}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { attempted: Math.min(tickers.length, safe), ok, errors };
}
