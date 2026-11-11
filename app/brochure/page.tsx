import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { connection } from "next/server"
import { XIcon } from "lucide-react"

import { BrochureFlipbook } from "@/components/public/brochure-flipbook"
import { brandName, getPublicSite } from "@/lib/server/public-site"
import { pageMetadata } from "@/lib/server/seo"

// The brochure the admin uploaded (Home → Brochure), as a flip-book.
export async function generateMetadata(): Promise<Metadata> {
  const { business, coverImage } = await getPublicSite()
  const name = brandName(business.name || "Chrish Wedding Cars")
  return pageMetadata({
    title: `Brochure | ${name}`,
    absoluteTitle: true,
    description: `Flip through the ${name} brochure: our decorated wedding cars, packages and services in Ja-Ela, Gampaha and Colombo.`,
    path: "/brochure",
    image: coverImage,
    imageAlt: "Decorated wedding car",
  })
}

export default async function BrochurePage() {
  await connection()
  const { business, brochure } = await getPublicSite()
  const name = brandName(business.name || "Chrish Wedding Cars")
  return (
    <div className="min-h-svh bg-[radial-gradient(ellipse_at_top,#4A3F37_0%,#2A2420_55%,#1C1815_100%)] text-[#F6EEE2]">
      <header className="mx-auto flex max-w-[88rem] items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <Link href="/" aria-label={`${name} — home`} className="flex items-center gap-3">
          <Image src="/logo.png" alt={`${name} logo`} width={64} height={64} className="h-12 w-auto drop-shadow-[0_0_14px_rgba(255,236,200,0.35)]" />
          <span className="hidden text-[11px] font-medium tracking-[0.3em] uppercase sm:block">Brochure</span>
        </Link>
        <h1 className="sr-only">{name} brochure</h1>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-2 text-sm transition hover:bg-white/10"
        >
          <XIcon className="size-4" aria-hidden />
          Close
        </Link>
      </header>
      <main className="mx-auto max-w-[88rem] px-3 pb-6 sm:px-8">
        {brochure ? (
          <BrochureFlipbook url={brochure.url} title={`${name} brochure`} />
        ) : (
          <div className="mx-auto mt-24 grid max-w-md gap-4 text-center">
            <p className="text-2xl font-medium">Our new brochure is on its way.</p>
            <p className="text-[#F6EEE2]/75">
              In the meantime, call us{business.phone ? ` on ${business.phone}` : ""} or browse the fleet on our website.
            </p>
            <Link href="/#fleet" className="mx-auto rounded-full bg-[#F6EEE2] px-5 py-2.5 text-sm font-medium text-[#16120E]">
              See the fleet
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
