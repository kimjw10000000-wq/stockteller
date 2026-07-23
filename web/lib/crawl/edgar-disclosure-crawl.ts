/**
 * SEC “current filings” poller → Gemini (JSON) → Supabase `disclosures`.
 * Used by `npm run crawl` and `/api/cron/disclosure-crawl`.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SEC_ATOM =
  "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-k&count=40&output=atom";

const SYSTEM = `You analyze disclosures. Reason internally: (1) 공시의 의도 (2) 재무적 영향 (3) 최종 결론 — then output ONLY JSON (no markdown):
{"title":"...","summary_lines":["의도 한 줄","재무 영향 한 줄","최종 결론 한 줄"],"sentiment":"positive|negative|neutral","score":number}
summary_lines: 3 Korean lines in that order. score: 호재/악재 -100..+100. Unreadable → title "분석 불가", neutral, 0.`;

export type CrawlResult = {
  ok: boolean;
  inserted: number;
  scanned: number;
  message: string;
};

function stripHtml(html: string) {
  return String(html)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchAll(regex: RegExp, text: string): RegExpExecArray[] {
  const out: RegExpExecArray[] = [];
  const r = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = r.exec(text)) !== null) out.push(m);
  return out;
}

function parseAtom(xml: string) {
  const entries: Array<{
    title: string;
    idHref: string;
    updated: string;
    summary: string;
    link: string;
  }> = [];
  const block = /<entry>([\s\S]*?)<\/entry>/g;
  for (const m of matchAll(block, xml)) {
    const chunk = m[1];
    const title = (/<title(?:[^>]*)>([\s\S]*?)<\/title>/i.exec(chunk) || [])[1];
    const id = (/<id[^>]*>([\s\S]*?)<\/id>/i.exec(chunk) || [])[1];
    const updated = (/<updated>([^<]+)<\/updated>/i.exec(chunk) || [])[1];
    const summary = (/<summary(?:[^>]*)>([\s\S]*?)<\/summary>/i.exec(chunk) || [])[1];
    const link =
      (/<link[^>]+href="([^"]+)"[^>]*\/?>/i.exec(chunk) || [])[1] ||
      (/<link[^>]+href='([^']+)'[^>]*\/?>/i.exec(chunk) || [])[1];
    if (!title) continue;
    entries.push({
      title: stripHtml(title),
      idHref: id ? stripHtml(id) : "",
      updated: updated?.trim() ?? "",
      summary: summary ? stripHtml(summary) : "",
      link: link?.trim() ?? "",
    });
  }
  return entries;
}

function accessionFromText(t: string) {
  const m = /(\d{10}-\d{2}-\d{6})/.exec(t || "");
  return m ? m[1] : null;
}

function signalFromSentiment(sentiment: string): "positive" | "neutral" | "caution" | "danger" {
  if (sentiment === "positive") return "positive";
  if (sentiment === "negative") return "danger";
  return "neutral";
}

async function analyzeGemini(rawText: string) {
  const key = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3-flash-preview";
  if (!key) throw new Error("GEMINI_API_KEY missing");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(key)}`;

  const truncated =
    rawText.length > 48_000 ? `${rawText.slice(0, 48_000)}\n\n[truncated]` : rawText;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: truncated }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.35 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

  if (!text) throw new Error("Empty Gemini body");

  const cleaned = String(text)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: {
    title?: string;
    summary_lines?: unknown;
    sentiment?: string;
    score?: number;
  };
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Gemini JSON parse failed: ${msg}`);
  }

  const sentiment = ["positive", "negative", "neutral"].includes(parsed.sentiment ?? "")
    ? (parsed.sentiment as "positive" | "negative" | "neutral")
    : "neutral";
  const lines = Array.isArray(parsed.summary_lines)
    ? parsed.summary_lines.map(String).filter(Boolean)
    : [];
  while (lines.length < 3) lines.push("—");

  return {
    title: String(parsed.title ?? "제목 없음"),
    summary_lines: lines.slice(0, 3),
    sentiment,
    score: Number.isFinite(Number(parsed.score)) ? Number(parsed.score) : 0,
  };
}

async function fetchSecAtom(ua: string, attempts = 3): Promise<string> {
  let lastStatus = 0;
  let lastBody = "";
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1500 * i));
    const atomRes = await fetch(SEC_ATOM, {
      headers: {
        "User-Agent": ua,
        Accept: "application/atom+xml,application/xml,text/xml,*/*",
        "Accept-Encoding": "identity",
      },
      cache: "no-store",
    });
    if (atomRes.ok) return atomRes.text();
    lastStatus = atomRes.status;
    lastBody = await atomRes.text().catch(() => "");
    // 403/429: retry; other 4xx: fail fast
    if (atomRes.status !== 403 && atomRes.status !== 429 && atomRes.status < 500) break;
  }
  throw new Error(`SEC atom fetch failed ${lastStatus}: ${lastBody.slice(0, 300)}`);
}

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

export async function runEdgarDisclosureCrawl(
  supabase?: SupabaseClient
): Promise<CrawlResult> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const service = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const ua =
    process.env.SEC_USER_AGENT?.trim() ||
    "WhyUpDisclosureCrawler/1.0 (+https://whyup.net; contact@whyup.net)";

  const client =
    supabase ??
    createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

  const xml = await fetchSecAtom(ua);
  const entries = parseAtom(xml);
  const max = Math.max(1, Number(process.env.CRAWL_MAX_ITEMS || 8) || 8);
  let processed = 0;
  let insertFailures = 0;

  for (const e of entries) {
    if (processed >= max) break;
    const acc =
      accessionFromText(e.link) || accessionFromText(e.idHref) || accessionFromText(e.title);
    if (!acc) continue;

    const { data: existing, error: exErr } = await client
      .from("disclosures")
      .select("id")
      .eq("external_id", acc)
      .maybeSingle();
    if (exErr) {
      console.warn("lookup skip", acc, exErr.message);
      continue;
    }
    if (existing?.id) continue;

    const raw = [
      `Title: ${e.title}`,
      e.updated ? `Updated: ${e.updated}` : "",
      e.link ? `Link: ${e.link}` : "",
      e.summary ? `Summary: ${e.summary}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    let analysis: Awaited<ReturnType<typeof analyzeGemini>>;
    try {
      analysis = await analyzeGemini(raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("Gemini failed for", acc, msg);
      analysis = {
        title: "AI 분석 실패",
        summary_lines: [
          "Gemini 호출에 실패했습니다.",
          msg.slice(0, 200),
          "원문 메타데이터만 저장합니다.",
        ],
        sentiment: "neutral",
        score: 0,
      };
    }

    const insertRow = {
      stock_id: null,
      external_id: acc,
      title: analysis.title,
      raw_content: raw,
      summary: analysis.summary_lines.join("\n"),
      sentiment: analysis.sentiment,
      analysis_score: analysis.score,
      market_type: "us" as const,
      signal_status: signalFromSentiment(analysis.sentiment),
      membership_type: "free" as const,
      gemini_metadata: { source: "edgar-disclosure-crawl", accession: acc },
    };

    const { error: insErr } = await client.from("disclosures").insert(insertRow);
    if (insErr) {
      // unique race from concurrent crawlers — treat as already present
      if (/duplicate|unique/i.test(insErr.message)) {
        console.warn("insert race (already exists)", acc);
        continue;
      }
      console.warn("insert failed", acc, insErr.message);
      insertFailures += 1;
      continue;
    }

    processed += 1;
    console.log("inserted", acc, analysis.title);
  }

  const message = `done, inserted ${processed} (scanned ${entries.length}, insertFailures ${insertFailures})`;
  console.log(message);

  if (entries.length === 0) {
    return { ok: false, inserted: 0, scanned: 0, message: "SEC atom returned 0 entries" };
  }

  // Hard fail only when inserts are broken (schema/RLS), not when feed is already fully crawled
  if (insertFailures > 0 && processed === 0) {
    return {
      ok: false,
      inserted: 0,
      scanned: entries.length,
      message: `All inserts failed (${insertFailures}). Check disclosures schema/RLS.`,
    };
  }

  return { ok: true, inserted: processed, scanned: entries.length, message };
}
