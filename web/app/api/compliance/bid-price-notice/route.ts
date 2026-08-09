import { NextResponse } from "next/server";
import { getUsListedCompany } from "@/lib/companies/search";
import { scanBidPriceDeficiencyNotice } from "@/lib/sec/bid-price-deficiency-scan";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function touchCompanyInStocks(ticker: string) {
  try {
    const admin = createAdminClient();
    const company = await getUsListedCompany(admin, ticker);
    if (!company) return;
    await admin.from("stocks").upsert(
      {
        name: company.name,
        ticker: company.ticker,
        market: "us",
      },
      { onConflict: "ticker" }
    );
  } catch (e) {
    console.warn("[compliance/bid-price-notice] stocks upsert skipped", e);
  }
}

export async function GET(req: Request) {
  const ticker = new URL(req.url).searchParams.get("ticker")?.trim() ?? "";
  if (!ticker) {
    return NextResponse.json({ ok: false, error: "ticker 쿼리가 필요합니다." }, { status: 400 });
  }

  try {
    void touchCompanyInStocks(ticker);
    const result = await scanBidPriceDeficiencyNotice(ticker);
    if (!result.ok) {
      return NextResponse.json(result, { status: 404 });
    }

    // Prefer canonical name from us_listed_companies when available
    try {
      const admin = createAdminClient();
      const company = await getUsListedCompany(admin, result.ticker);
      if (company?.name) {
        return NextResponse.json({
          ...result,
          companyName: company.name,
          exchange: company.exchange,
          marketCap: company.market_cap,
          cik: company.cik,
        });
      }
    } catch {
      /* table may not exist yet */
    }

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[compliance/bid-price-notice]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
