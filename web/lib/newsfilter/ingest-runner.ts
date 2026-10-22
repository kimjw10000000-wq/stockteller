import { capBucket } from "@/lib/gnw/tickers";
import { analyzeWireTeaser } from "@/lib/llm/analyze-wire";
import { fetchNewsfilterTickerPage, type NewsfilterArticle } from "@/lib/newsfilter/ticker-page";
import { createAdminClient } from "@/lib/supabase/admin";

const SOURCE = "newsfilter";
const MAX_ARTICLES = 3;
const LOOKBACK_MS = 48 * 60 * 60 * 1000;

const inflight = new Set<string>();

function recentArticles(articles: NewsfilterArticle[], now: number): NewsfilterArticle[] {
  return articles
    .filter((article) => {
      const at = Date.parse(article.publishedAt);
      return Number.isFinite(at) && now - at <= LOOKBACK_MS && at <= now + 5 * 60_000;
    })
    .slice(0, MAX_ARTICLES);
}

async function hasOriginalColumns(): Promise<boolean> {
  const { error } = await createAdminClient().from("wire_news").select("original_title").limit(1);
  return !error;
}

async function alreadyStored(ids: string[]): Promise<Set<string>> {
  const seen = new Set<string>();
  if (ids.length === 0) return seen;
  const { data, error } = await createAdminClient()
    .from("wire_news")
    .select("external_id")
    .eq("source", SOURCE)
    .in("external_id", ids);
  if (error) {
    console.warn("[newsfilter] lookup", error.message);
    return seen;
  }
  for (const row of data ?? []) {
    if (row.external_id) seen.add(String(row.external_id));
  }
  return seen;
}

async function companyFor(ticker: string): Promise<{ name: string | null; marketCap: number | null }> {
  const { data } = await createAdminClient()
    .from("us_listed_companies")
    .select("name, market_cap")
    .eq("ticker", ticker)
    .maybeSingle();
  const marketCap = data?.market_cap;
  return {
    name: data?.name ? String(data.name) : null,
    marketCap: typeof marketCap === "number" && Number.isFinite(marketCap) ? marketCap : null,
  };
}

async function storeArticle(
  ticker: string,
  company: { name: string | null; marketCap: number | null },
  article: NewsfilterArticle,
  withOriginal: boolean
): Promise<boolean> {
  const analyzed = await analyzeWireTeaser({
    ticker,
    title: article.title,
    teaser: article.teaser || article.title,
  });
  if (!analyzed.ok) {
    console.warn("[newsfilter] groq", ticker, article.id, analyzed.error.slice(0, 200));
    return false;
  }
  const lines = analyzed.data.summary_lines.filter((line) => line && line !== "—");
  const summary = lines.join("\n");
  const row: Record<string, unknown> = {
    source: SOURCE,
    external_id: article.id,
    url: article.url,
    title: analyzed.data.title,
    teaser: lines[0] ?? null,
    summary: summary || null,
    sentiment: analyzed.data.sentiment,
    analysis_score: analyzed.data.score,
    tickers: [ticker],
    primary_ticker: ticker,
    company_name: company.name,
    published_at: article.publishedAt,
    market_cap: company.marketCap,
    cap_bucket: capBucket(company.marketCap),
    language: "ko",
    llm_model: analyzed.model,
    affiliation: "news",
    newswire: article.source || null,
    form_type: null,
    accession: null,
  };
  if (withOriginal) {
    row.original_title = article.title;
    row.original_teaser = article.teaser || null;
    row.original_summary = article.teaser || null;
  }
  const { error } = await createAdminClient().from("wire_news").insert(row);
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return false;
    console.warn("[newsfilter] insert", ticker, article.id, error.message);
    return false;
  }
  return true;
}

async function ingestTicker(ticker: string): Promise<number> {
  const articles = recentArticles(await fetchNewsfilterTickerPage(ticker), Date.now());
  if (articles.length === 0) return 0;
  const [company, stored, withOriginal] = await Promise.all([
    companyFor(ticker),
    alreadyStored(articles.map((article) => article.id)),
    hasOriginalColumns(),
  ]);
  let inserted = 0;
  for (const article of articles) {
    if (stored.has(article.id)) continue;
    if (await storeArticle(ticker, company, article, withOriginal)) inserted += 1;
  }
  if (inserted > 0) console.log("[newsfilter]", ticker, "inserted", inserted);
  return inserted;
}

/** Public Newsfilter ticker page → existing Groq Korean summary. One pass per ticker. */
export async function ingestNewsfilterRunners(tickers: string[]): Promise<number> {
  const pending: string[] = [];
  for (const raw of tickers) {
    const ticker = raw.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker) || inflight.has(ticker)) continue;
    inflight.add(ticker);
    pending.push(ticker);
  }
  let inserted = 0;
  for (const ticker of pending) {
    try {
      inserted += await ingestTicker(ticker);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[newsfilter]", ticker, message.slice(0, 240));
    } finally {
      inflight.delete(ticker);
    }
  }
  return inserted;
}
