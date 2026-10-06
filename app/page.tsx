import type { Metadata } from "next"
import { after, connection } from "next/server"

import { PublicHome } from "@/components/public/availability-checker"
import { syncFacebookReelIfDue } from "@/lib/server/facebook"
import { getPublicSite } from "@/lib/server/public-site"
import { homeDescription, homeJsonLd, homeTitle, ldJson, pageMetadata } from "@/lib/server/seo"
import { todayInBusinessTz } from "@/lib/server/today"

// The website's home page for customers (no login). Rendered on the server
// so search engines see the real fleet and text. Shows our own fleet only
// and no hire details; availability is answered per car + date by
// /api/availability. The admin area is at /admin.
export async function generateMetadata(): Promise<Metadata> {
  const { business, coverImage } = await getPublicSite()
  return pageMetadata({
    title: homeTitle(business.name),
    absoluteTitle: true,
    description: homeDescription,
    path: "/",
    image: coverImage,
    imageAlt: "Decorated white wedding car",
  })
}

export default async function HomePage() {
  // Render per request so "today" is the real today, not the build date.
  await connection()
  const site = await getPublicSite()
  after(() => syncFacebookReelIfDue().catch((err) => console.error("Facebook sync:", err)))
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(homeJsonLd(site.business, site.cars, site.coverImage)) }} />
      <PublicHome today={todayInBusinessTz()} business={site.business} cars={site.cars} video={site.video} />
    </>
  )
}
