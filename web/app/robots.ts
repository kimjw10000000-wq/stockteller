import type { MetadataRoute } from "next";
import { ROBOTS_DISALLOW_USER_AGENTS } from "@/lib/security/crawlers";
import { getSiteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function robots(): MetadataRoute.Robots {
  const u = getSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/dashboard/"],
      },
      ...ROBOTS_DISALLOW_USER_AGENTS.map((userAgent) => ({
        userAgent,
        disallow: "/" as const,
      })),
    ],
    sitemap: `${u.origin}/sitemap.xml`,
    host: u.host,
  };
}
