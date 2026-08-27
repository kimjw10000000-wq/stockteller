export type GnwRssItem = {
  id: string;
  url: string;
  title: string;
  teaser: string;
  stockTags: string[];
  ciks: string[];
  publishedAt: string | null;
  companyName: string | null;
  language: string | null;
};

const FEEDS = [
  "https://www.globenewswire.com/RssFeed/orgclass/1/feedTitle/GlobeNewswire%20-%20News%20about%20Public%20Companies",
  "https://www.globenewswire.com/RssFeed/subjectcode/17-Financing%20Agreements/feedTitle/GlobeNewswire%20-%20Financing%20Agreements",
  "https://www.globenewswire.com/RssFeed/country/United%20States/feedTitle/GlobeNewswire%20-%20News%20from%20United%20States",
];

const UA = "Whyup/1.0 (news@whyup.net)";

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function stripHtml(s: string): string {
  return decodeEntities(s)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tagAll(xml: string, name: string): string[] {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    out.push(decodeEntities(m[1]));
  }
  return out;
}

function firstTag(xml: string, name: string): string {
  return tagAll(xml, name)[0] ?? "";
}

function parseItem(chunk: string): GnwRssItem | null {
  const guid = firstTag(chunk, "guid") || firstTag(chunk, "link");
  const url = firstTag(chunk, "link") || guid;
  const title = stripHtml(firstTag(chunk, "title"));
  if (!guid || !url || !title) return null;

  const categories = tagAll(chunk, "category");
  const stockTickers = tagAll(chunk, "StockTickers");
  const teaser = stripHtml(firstTag(chunk, "description")).slice(0, 2_000);
  const ciks = [...tagAll(chunk, "cik"), ...tagAll(chunk, "CIK")]
    .map((v) => v.replace(/\D/g, "").padStart(10, "0"))
    .filter((v) => v.length === 10 && v !== "0000000000");

  return {
    id: guid.slice(0, 500),
    url: url.slice(0, 2_000),
    title: title.slice(0, 500),
    teaser,
    stockTags: [...categories, ...stockTickers],
    ciks: [...new Set(ciks)],
    publishedAt: firstTag(chunk, "pubDate") || null,
    companyName: stripHtml(firstTag(chunk, "dc:creator")) || null,
    language: firstTag(chunk, "language") || "en",
  };
}

async function fetchFeed(url: string): Promise<GnwRssItem[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`GNW RSS ${res.status} ${url}`);
  }
  const xml = await res.text();
  const chunks = xml.split(/<item>/i).slice(1);
  const items: GnwRssItem[] = [];
  for (const chunk of chunks) {
    const body = chunk.split(/<\/item>/i)[0] ?? "";
    const item = parseItem(body);
    if (item) items.push(item);
  }
  return items;
}

export async function fetchGnwRssFeeds(): Promise<GnwRssItem[]> {
  const batches = await Promise.allSettled(FEEDS.map((url) => fetchFeed(url)));
  const seen = new Set<string>();
  const out: GnwRssItem[] = [];
  for (const batch of batches) {
    if (batch.status === "rejected") {
      console.warn("[gnw rss]", batch.reason instanceof Error ? batch.reason.message : batch.reason);
      continue;
    }
    for (const item of batch.value) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}
