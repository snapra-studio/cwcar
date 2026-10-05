import type { MetadataRoute } from "next"

import { siteUrl } from "@/lib/server/public-site"

// Search engines may crawl the customer website (and its photos), never the
// admin or driver areas or the API.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/wedding-cars", "/api/files/", "/api/public/hero"],
        disallow: ["/admin", "/driver", "/api/", "/dashboard", "/login"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  }
}
