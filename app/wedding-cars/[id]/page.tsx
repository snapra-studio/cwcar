import type { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"
import { connection } from "next/server"

import { CarDetail } from "@/components/public/car-pages"
import { brandName, getPublicSite } from "@/lib/server/public-site"
import { carDescription, carJsonLd, carTitle, ldJson, pageMetadata } from "@/lib/server/seo"
import { todayInBusinessTz } from "@/lib/server/today"

// One of our own wedding cars. Partner cars and removed cars are "not found".
type Props = { params: Promise<{ id: string }> }

// The address is the car's slug; an old link by car id moves to the slug.
async function findCar(param: string) {
  const site = await getPublicSite()
  const key = decodeURIComponent(param)
  const car = site.cars.find((c) => c.slug === key)
  const byId = car ? undefined : site.cars.find((c) => c.id === key)
  return { site, car, byId }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { site, car } = await findCar((await params).id)
  if (!car) return { title: "Car not found", robots: { index: false } }
  return pageMetadata({
    title: `${carTitle(car)} | ${brandName(site.business.name)}`,
    absoluteTitle: true,
    description: carDescription(car, site.business.name),
    path: `/wedding-cars/${car.slug}`,
    image: car.image,
    imageAlt: `${car.color} ${car.name} wedding car`,
  })
}

export default async function CarPage({ params }: Props) {
  await connection()
  const { site, car, byId } = await findCar((await params).id)
  if (byId) permanentRedirect(`/wedding-cars/${byId.slug}`)
  if (!car) notFound()
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(carJsonLd(car, site.business)) }} />
      <CarDetail car={car} business={site.business} cars={site.cars} today={todayInBusinessTz()} />
    </>
  )
}
