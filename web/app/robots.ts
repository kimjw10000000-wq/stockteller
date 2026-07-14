import type { MetadataRoute } from "next";
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
        disallow: ["/admin", "/api/"],
      },
    ],
    sitemap: `${u.origin}/sitemap.xml`,
    host: u.host,
  };
}
