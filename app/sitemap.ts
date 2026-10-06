import type { MetadataRoute } from "next"

import { getPublicSite } from "@/lib/server/public-site"
import { carUrl } from "@/lib/server/seo"
import { siteUrl } from "@/lib/server/public-site"

// XML sitemap of the customer website: home, the fleet and each own car.
export const dynamic = "force-dynamic"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { cars } = await getPublicSite()
  const now = new Date()
  const base = siteUrl()
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/wedding-cars`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    ...cars.map((c) => ({
      url: carUrl(c),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
      images: c.image ? [`${base}${c.image}`] : undefined,
    })),
  ]
}
