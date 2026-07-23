import type { MetadataRoute } from "next";
import { listAllDisclosureSitemapEntries } from "@/lib/disclosures";
import { getSiteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl().origin;

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/feed`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${base}/volatile`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.75,
    },
    {
      url: `${base}/compliance`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${base}/halts`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.7,
    },
  ];

  try {
    const items = await listAllDisclosureSitemapEntries();
    const newsUrls: MetadataRoute.Sitemap = items.map((item) => ({
      url: `${base}/news/${item.id}`,
      lastModified: item.created_at ? new Date(item.created_at) : new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    }));
    return [...staticPages, ...newsUrls];
  } catch {
    return staticPages;
  }
}
