import type { Metadata } from "next"
import { connection } from "next/server"

import { FleetIndex } from "@/components/public/car-pages"
import { brandName, getPublicSite } from "@/lib/server/public-site"
import { abs, carUrl, ldJson, pageMetadata } from "@/lib/server/seo"
import { todayInBusinessTz } from "@/lib/server/today"

// All our own wedding cars (partner cars are never listed).
export async function generateMetadata(): Promise<Metadata> {
  const { business, coverImage, cars } = await getPublicSite()
  return pageMetadata({
    title: `Wedding Cars for Hire in Ja-Ela, Sri Lanka | ${brandName(business.name)}`,
    absoluteTitle: true,
    description: `Browse our ${cars.length} luxury and classic wedding cars for hire — decorated with flowers, with a professional chauffeur. Check availability online for your wedding or homecoming.`,
    path: "/wedding-cars",
    image: coverImage,
  })
}

export default async function WeddingCarsPage() {
  await connection()
  const site = await getPublicSite()
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        name: "Wedding cars for hire",
        itemListElement: site.cars.map((c, i) => ({ "@type": "ListItem", position: i + 1, url: carUrl(c), name: `${c.color} ${c.name}` })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: abs("/") },
          { "@type": "ListItem", position: 2, name: "Wedding cars", item: abs("/wedding-cars") },
        ],
      },
    ],
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(ld) }} />
      <FleetIndex business={site.business} cars={site.cars} today={todayInBusinessTz()} />
    </>
  )
}
