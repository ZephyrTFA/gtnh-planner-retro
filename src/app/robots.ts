import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const base = SITE_URL;
  return {
    rules: [
      {
        userAgent: "*",
        // The card route stays crawlable: Twitterbot honours robots.txt, and
        // blocking it would strip the image off every shared plan's unfurl.
        allow: ["/", "/api/community/plans/*/card"],
        // JSON endpoints and dataset shards have no place in an index.
        disallow: ["/api/", "/datasets/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
