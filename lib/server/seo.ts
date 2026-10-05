import "server-only"

import type { Metadata } from "next"

import { FAQ, KEYWORDS, SITE_DESCRIPTION, SITE_TITLE } from "@/components/public/content"
import { brandName, siteUrl, type PublicBusiness } from "@/lib/server/public-site"
import type { CarStyle } from "@/lib/bridal/types"

// Search-engine metadata and Schema.org structured data for the customer
// website. Admin and driver pages are kept out of search (see app/robots.ts).

type Car = { id: string; slug: string; name: string; color: string; style: CarStyle; image?: string }

const FACEBOOK = "https://www.facebook.com/people/Chrish-Wedding-Cars-Rentals/61579116013524/"
const BODY: Record<CarStyle, string> = { sedan: "Sedan", vintage: "Classic car", suv: "SUV" }
const STYLE_WORDS: Record<CarStyle, string> = { sedan: "luxury sedan", vintage: "vintage classic", suv: "SUV" }

export const abs = (path: string) => (path.startsWith("http") ? path : `${siteUrl()}${path.startsWith("/") ? "" : "/"}${path}`)
export const carUrl = (c: Pick<Car, "slug">) => abs(`/wedding-cars/${c.slug}`)

// "070 10 71 777" -> "+94701071777"
const intlPhone = (p: string) => {
  const d = p.replace(/\D/g, "")
  return d ? (d.startsWith("0") ? `+94${d.slice(1)}` : `+${d}`) : undefined
}

export function pageMetadata({
  title,
  description,
  path,
  image,
  imageAlt,
  absoluteTitle,
}: {
  title: string
  description: string
  path: string
  image?: string
  imageAlt?: string
  absoluteTitle?: boolean
}): Metadata {
  const images = image ? [{ url: abs(image), alt: imageAlt ?? title }] : [{ url: abs("/logo.png"), alt: "Chrish Wedding Cars logo" }]
  return {
    metadataBase: new URL(siteUrl()),
    title: absoluteTitle ? { absolute: title } : title,
    description,
    keywords: KEYWORDS,
    alternates: { canonical: path },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
    openGraph: {
      type: "website",
      siteName: "Chrish Wedding Cars & Rentals",
      locale: "en_LK",
      url: path,
      title,
      description,
      images,
    },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: images.map((i) => i.url) },
    formatDetection: { telephone: true, address: true, email: true },
  }
}

export const homeTitle = (biz: string) => `${SITE_TITLE} | ${brandName(biz)}`
export const homeDescription = SITE_DESCRIPTION

export function carTitle(c: Car) {
  return `${c.color} ${c.name} Wedding Car Hire`
}
export function carDescription(c: Car, biz: string) {
  return `Hire our ${c.color.toLowerCase()} ${c.name} ${STYLE_WORDS[c.style]} for your wedding or homecoming in Ja-Ela, Sri Lanka. Decorated with fresh or artificial flowers, with a professional chauffeur. Check its availability online and book with ${brandName(biz)}.`
}

// ---- Structured data ----

function business(biz: PublicBusiness, image?: string) {
  return {
    "@type": "AutoRental",
    "@id": abs("/#business"),
    name: brandName(biz.name) || "Chrish Wedding Cars & Rentals",
    legalName: biz.name || undefined,
    url: abs("/"),
    logo: abs("/logo.png"),
    image: image ? abs(image) : abs("/logo.png"),
    description: SITE_DESCRIPTION,
    telephone: intlPhone(biz.phone),
    email: biz.email || undefined,
    address: biz.address
      ? { "@type": "PostalAddress", streetAddress: biz.address, addressLocality: "Ja-Ela", addressRegion: "Western Province", addressCountry: "LK" }
      : undefined,
    areaServed: ["Ja-Ela", "Gampaha", "Negombo", "Colombo", "Western Province, Sri Lanka"],
    sameAs: [FACEBOOK],
  }
}

export function homeJsonLd(biz: PublicBusiness, cars: Car[], image?: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      business(biz, image),
      { "@type": "WebSite", "@id": abs("/#website"), url: abs("/"), name: "Chrish Wedding Cars & Rentals", publisher: { "@id": abs("/#business") }, inLanguage: "en" },
      {
        "@type": "ItemList",
        name: "Our wedding car fleet",
        itemListElement: cars.map((c, i) => ({ "@type": "ListItem", position: i + 1, url: carUrl(c), name: `${c.color} ${c.name}` })),
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  }
}

export function carJsonLd(c: Car, biz: PublicBusiness) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Car",
        name: `${c.color} ${c.name}`,
        url: carUrl(c),
        image: c.image ? abs(c.image) : undefined,
        color: c.color,
        bodyType: BODY[c.style],
        brand: { "@type": "Brand", name: c.name.split(/\s+/)[0] },
        description: carDescription(c, biz.name),
        offers: { "@type": "Offer", availability: "https://schema.org/InStock", businessFunction: "http://purl.org/goodrelations/v1#LeaseOut", seller: { "@id": abs("/#business") } },
      },
      business(biz),
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: abs("/") },
          { "@type": "ListItem", position: 2, name: "Wedding cars", item: abs("/wedding-cars") },
          { "@type": "ListItem", position: 3, name: `${c.color} ${c.name}`, item: carUrl(c) },
        ],
      },
    ],
  }
}

// <script type="application/ld+json"> contents, safe to inline.
export const ldJson = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c")
