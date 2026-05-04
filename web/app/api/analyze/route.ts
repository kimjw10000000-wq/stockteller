import { NextResponse } from "next/server";
import { analyzeDisclosureText } from "@/lib/gemini/analyzeDisclosure";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

type Body = {
  rawContent?: string;
  stockId?: string | null;
  externalId?: string | null;
  save?: boolean;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = typeof body.rawContent === "string" ? body.rawContent.trim() : "";
  if (!raw) {
    return NextResponse.json({ ok: false, error: "rawContent is required" }, { status: 400 });
  }

  const result = await analyzeDisclosureText(raw);
  const summaryText = result.data
    ? result.data.summary_lines.join("\n")
    : undefined;

  const payload = {
    ok: result.ok,
    model: "model" in result && result.ok ? result.model : undefined,
    analysis: result.data ?? null,
    error: result.ok ? undefined : result.error,
    saved: false as boolean,
  };

  if (!body.save || !summaryText) {
    return NextResponse.json({ ...payload, saved: false });
  }

  try {
    const admin = createAdminClient();
    const title = result.data?.title ?? "분석 결과";
    const sentiment = result.data?.sentiment ?? "neutral";
    const score = result.data?.score ?? 0;

    const insertRow = {
      stock_id: body.stockId ?? null,
      external_id: body.externalId ?? null,
      title,
      raw_content: raw,
      summary: summaryText,
      sentiment,
      analysis_score: score,
      gemini_metadata: {
        gemini_ok: result.ok,
        gemini_error: result.ok ? null : result.error,
      },
    };

    const { error } = await admin.from("disclosures").insert(insertRow);
    if (error) {
      console.error("[analyze POST] insert", error.message);
      return NextResponse.json(
        { ...payload, saved: false, dbError: error.message },
        { status: 207 }
      );
    }

    return NextResponse.json({ ...payload, saved: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "DB error";
    console.error("[analyze POST]", message);
    return NextResponse.json({ ...payload, saved: false, dbError: message }, { status: 207 });
  }
}
