export type NewsfilterArticle = {
  id: string;
  url: string;
  title: string;
  teaser: string;
  source: string;
  publishedAt: string;
};

const PAGE = "https://newsfilter.io/ticker";

function decodeText(raw: string): string {
  return raw
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseNewsfilterTickerHtml(html: string): NewsfilterArticle[] {
  const articles: NewsfilterArticle[] = [];
  const seen = new Set<string>();
  for (const chunk of html.split(/<li\b/i).slice(1)) {
    const publishedAt = chunk.match(/<time\b[^>]*\bdateTime="([^"]+)"/i)?.[1]?.trim() ?? "";
    const link = chunk.match(
      /<h2\b[^>]*>\s*<a\b[^>]*\bhref="(https:\/\/newsfilter\.io\/a\/([a-z0-9]+))"[^>]*>([\s\S]*?)<\/a>/i
    );
    if (!publishedAt || !link) continue;
    const id = link[2];
    if (seen.has(id)) continue;
    const title = decodeText(link[3]);
    if (!title) continue;
    const teaser = decodeText(chunk.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
    const spans = [...chunk.matchAll(/<span\b(?![^>]*aria-hidden)[^>]*>([^<]+)<\/span>/gi)]
      .map((match) => decodeText(match[1]))
      .filter((text) => text && text !== "·" && text !== "•");
    const source = spans[0] ?? "";
    const published = new Date(publishedAt);
    if (Number.isNaN(published.getTime())) continue;
    seen.add(id);
    articles.push({
      id,
      url: link[1],
      title,
      teaser,
      source,
      publishedAt: published.toISOString(),
    });
  }
  articles.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return articles;
}

export function newsfilterTickerUrl(ticker: string): string {
  return `${PAGE}/${encodeURIComponent(ticker)}`;
}

export async function fetchNewsfilterTickerPage(ticker: string): Promise<NewsfilterArticle[]> {
  const res = await fetch(newsfilterTickerUrl(ticker), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    throw new Error(`Newsfilter HTTP ${res.status}`);
  }
  return parseNewsfilterTickerHtml(await res.text());
}
