/**
 * Draft SEC “current filings” poller → Gemini (JSON) → Supabase `disclosures`.
 * SEC requires a descriptive User-Agent with contact info.
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   GEMINI_API_KEY, GEMINI_MODEL (optional, default gemini-3-flash-preview)
 *   SEC_USER_AGENT (optional but strongly recommended)
 */

import { createClient } from "@supabase/supabase-js";

const SEC_ATOM =
  "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-k&count=40&output=atom";

const SYSTEM = `You analyze disclosures. Reason internally: (1) 공시의 의도 (2) 재무적 영향 (3) 최종 결론 — then output ONLY JSON (no markdown):
{"title":"...","summary_lines":["의도 한 줄","재무 영향 한 줄","최종 결론 한 줄"],"sentiment":"positive|negative|neutral","score":number}
summary_lines: 3 Korean lines in that order. score: 호재/악재 -100..+100. Unreadable → title "분석 불가", neutral, 0.`;

function stripHtml(html) {
  return String(html)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function* matchAll(regex, text) {
  let m;
  const r = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
  while ((m = r.exec(text)) !== null) yield m;
}

function parseAtom(xml) {
  const entries = [];
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

function accessionFromText(t) {
  const m = /(\d{10}-\d{2}-\d{6})/.exec(t || "");
  return m ? m[1] : null;
}

async function analyzeGemini(rawText) {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
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

  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";

  if (!text) throw new Error("Empty Gemini body");

  const cleaned = String(text)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Gemini JSON parse failed: ${e?.message || e}`);
  }

  const sentiment = ["positive", "negative", "neutral"].includes(parsed.sentiment)
    ? parsed.sentiment
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

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    console.error("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
    process.exit(1);
  }

  const ua =
    process.env.SEC_USER_AGENT ||
    "DisclosureCrawler/1.0 (please-set-SEC_USER_AGENT; contact@example.com)";

  const supabase = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const atomRes = await fetch(SEC_ATOM, {
    headers: {
      "User-Agent": ua,
      Accept: "application/atom+xml",
    },
  });
  if (!atomRes.ok) {
    console.error("SEC atom fetch failed", atomRes.status, await atomRes.text());
    process.exit(1);
  }
  const xml = await atomRes.text();
  const entries = parseAtom(xml);
  const max = Number(process.env.CRAWL_MAX_ITEMS || 8);
  let processed = 0;

  for (const e of entries) {
    if (processed >= max) break;
    const acc =
      accessionFromText(e.link) || accessionFromText(e.idHref) || accessionFromText(e.title);
    if (!acc) continue;

    const { data: existing, error: exErr } = await supabase
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

    let analysis;
    try {
      analysis = await analyzeGemini(raw);
    } catch (err) {
      console.warn("Gemini failed for", acc, err.message || err);
      analysis = {
        title: "AI 분석 실패",
        summary_lines: [
          "Gemini 호출에 실패했습니다.",
          String(err.message || err).slice(0, 200),
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
      gemini_metadata: { source: "crawl-edgar.mjs", accession: acc },
    };

    const { error: insErr } = await supabase.from("disclosures").insert(insertRow);
    if (insErr) {
      console.warn("insert failed", acc, insErr.message);
      continue;
    }

    processed += 1;
    console.log("inserted", acc, analysis.title);
  }

  console.log("done, inserted", processed);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
