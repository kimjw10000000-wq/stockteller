import type { MetadataRoute } from "next";
import { listAllDisclosureSitemapEntries } from "@/lib/disclosures";
import { getSiteUrl } from "@/lib/site";

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
  ];

  try {
    const items = await listAllDisclosureSitemapEntries();
    const newsUrls: MetadataRoute.Sitemap = items.map((item) => ({
      url: `${base}/news/${item.id}`,
      lastModified: new Date(item.created_at),
      changeFrequency: "weekly",
      priority: 0.8,
    }));
    return [...staticPages, ...newsUrls];
  } catch {
    return staticPages;
  }
}
