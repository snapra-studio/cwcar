import "server-only"

import { carSlugs } from "@/components/public/slug"
import { getPublicCars, getSettings } from "@/lib/server/repo"

// What the customer website shows (rendered on the server so search engines
// see the real content): public business contact details, our own fleet
// (names, colours, types, photos — no prices, plates or partner cars) and the
// background video. Nothing about hires.
export type PublicBusiness = { name: string; phone: string; email: string; address: string }

// The site's public address, for canonical links, the sitemap and Open Graph.
export const siteUrl = () => (process.env.APP_URL || "https://www.chrishrentals.com").replace(/\/+$/, "")

export async function getPublicSite() {
  const [settings, list] = await Promise.all([getSettings(), getPublicCars()])
  // Each car gets a readable address (/wedding-cars/<slug>).
  const slugs = carSlugs(list)
  const cars = list.map((c) => ({ ...c, slug: slugs.get(c.id)! }))
  const business: PublicBusiness = {
    name: settings.bizName,
    phone: settings.bizPhone,
    email: settings.bizEmail,
    address: settings.bizAddr,
  }
  const video = settings.coverVideo?.startsWith("/api/files/") ? settings.coverVideo : undefined
  const coverImage = settings.coverImage?.startsWith("/api/files/") ? settings.coverImage : cars.find((c) => c.image)?.image
  return { business, cars, video, coverImage }
}

// "Chrish Wedding Cars pvt ltd" -> "Chrish Wedding Cars".
export const brandName = (name: string) => name.replace(/[\s,]*\(?pvt\)?\.?\s*ltd\.?\s*$/i, "").trim() || name

const STYLE: Record<string, string> = { sedan: "luxury sedan", vintage: "vintage classic", suv: "SUV" }
export const styleWords = (s: string) => STYLE[s] ?? "car"
