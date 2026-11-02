import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        // Dataset files and shards have no place in an index.
        disallow: ["/datasets/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
