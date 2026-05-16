import { NextResponse } from "next/server";
import { analyzeDualPerspective } from "@/lib/gemini/analyzeDualPerspective";
import { fetchLatest8kPlainText } from "@/lib/sec/edgar-latest-8k";

export const maxDuration = 120;

type Body = { ticker?: string };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const rawTicker = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
  if (!rawTicker || !/^[A-Z.\-]{1,10}$/.test(rawTicker)) {
    return NextResponse.json({ ok: false, error: "유효한 티커가 필요합니다." }, { status: 400 });
  }

  const ticker = rawTicker.replace(/\./g, "-"); // SEC 티커 관행

  const eight = await fetchLatest8kPlainText(ticker);
  if (!eight) {
    return NextResponse.json(
      {
        ok: false,
        error: "SEC에서 최근 8-K 본문을 찾지 못했습니다. 티커 또는 제출 지연을 확인해 주세요.",
      },
      { status: 404 }
    );
  }

  const gem = await analyzeDualPerspective(eight.plainText);
  if (!gem.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: gem.error,
        filing: {
          filingDate: eight.filingDate,
          accessionNumber: eight.accessionNumber,
        },
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    ticker,
    filing: {
      filingDate: eight.filingDate,
      accessionNumber: eight.accessionNumber,
      primaryDocument: eight.primaryDocument,
      cik: eight.cikPadded,
      secViewerUrl: `https://www.sec.gov/cgi-bin/viewer?action=view&cik=${encodeURIComponent(eight.cikPadded)}&accession_number=${encodeURIComponent(eight.accessionNumber)}&xbrl_type=v`,
    },
    analysis: gem.data,
    model: gem.model,
  });
}
