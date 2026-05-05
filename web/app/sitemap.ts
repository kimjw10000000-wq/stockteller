import type { MetadataRoute } from "next";
import { listDisclosures } from "@/lib/disclosures";
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
    const items = await listDisclosures(200);
    const disclosureUrls: MetadataRoute.Sitemap = items.map((item) => ({
      url: `${base}/disclosure/${item.id}`,
      lastModified: new Date(item.created_at),
      changeFrequency: "weekly",
      priority: 0.65,
    }));
    return [...staticPages, ...disclosureUrls];
  } catch {
    return staticPages;
  }
}
