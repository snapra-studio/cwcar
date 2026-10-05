"use client"

import * as React from "react"
import Image from "next/image"
import { ArrowUpRightIcon, MailIcon, MapPinIcon, MessageCircleIcon, PhoneIcon } from "lucide-react"

import { display } from "@/components/public/fonts"
import { Reveal } from "@/components/public/motion"
import type { CarStyle } from "@/lib/bridal/types"
import { cn } from "@/lib/utils"

// Pieces shared by the customer website's pages (home and each car's page).

export type PublicCar = { id: string; slug: string; name: string; color: string; hex: string; style: CarStyle; image?: string }
export type PublicBusiness = { name: string; phone: string; email: string; address: string }

export const STYLE_LABEL: Record<CarStyle, string> = { sedan: "Sedan", vintage: "Vintage", suv: "SUV" }
const STYLE_WORDS: Record<CarStyle, string> = { sedan: "luxury sedan", vintage: "vintage classic", suv: "SUV" }

// The car's own page, e.g. /wedding-cars/white-bmw-520d.
export const carPath = (c: Pick<PublicCar, "slug">) => `/wedding-cars/${c.slug}`
// Photo description for search engines and screen readers.
export const carAlt = (c: PublicCar) => `${c.color} ${c.name} ${STYLE_WORDS[c.style]} wedding car decorated for hire`

export const tel = (p: string) => `tel:${p.replace(/\s/g, "")}`
// "070 10 71 777" -> "94701071777" for WhatsApp (Sri Lanka).
export const wa = (p: string) => {
  const d = p.replace(/\D/g, "")
  return `https://wa.me/${d.startsWith("0") ? `94${d.slice(1)}` : d}`
}
export const mapLink = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`

export const INK = "text-[#16120E]"
export const MUTED = "text-[#6B6259]"
export const EYEBROW = cn("mb-4 text-xs font-medium tracking-[0.3em] uppercase", MUTED)
export const PILL_DARK =
  "inline-flex items-center justify-center gap-2 rounded-full bg-[#16120E] px-5 py-3 text-sm font-medium text-white shadow-[0_10px_30px_-10px_rgba(22,18,14,0.6)] transition hover:-translate-y-0.5 hover:bg-black"
export const PILL_LIGHT =
  "inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-medium text-[#16120E] shadow-sm transition hover:-translate-y-0.5 hover:border-black/20"

export function Chip({ on, className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm transition",
        on ? "border-[#16120E] bg-[#16120E] text-white" : "border-black/10 bg-white hover:border-black/30",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function Contact({ business, bizName }: { business: PublicBusiness; bizName: string }) {
  const items = [
    business.phone && { icon: PhoneIcon, label: "Call", value: business.phone, href: tel(business.phone) },
    business.phone && { icon: MessageCircleIcon, label: "WhatsApp", value: "Message us", href: wa(business.phone), external: true },
    business.email && { icon: MailIcon, label: "Email", value: business.email, href: `mailto:${business.email}` },
    business.address && { icon: MapPinIcon, label: "Visit", value: business.address, href: mapLink(business.address), external: true },
  ].filter((x): x is { icon: typeof PhoneIcon; label: string; value: string; href: string; external?: boolean } => !!x)
  return (
    <section id="contact" aria-labelledby="contact-title" className="scroll-mt-24 px-3 py-6 sm:px-4">
      <div className="relative mx-auto max-w-[88rem] overflow-hidden rounded-[2rem] border border-black/[0.06] bg-white px-6 py-16 sm:px-12 sm:py-24">
        <div aria-hidden className="pointer-events-none absolute -top-32 -right-24 size-[30rem] rounded-full bg-[radial-gradient(circle,rgba(233,206,160,0.45),rgba(240,210,214,0.3)_45%,transparent_70%)] blur-2xl" />
        <div className="relative grid gap-12 *:min-w-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end">
          <Reveal>
            <h2 id="contact-title" className={EYEBROW}>
              Contact {bizName}
            </h2>
            <p className={cn(display.className, "text-[clamp(2.5rem,11vw,6.5rem)] leading-[0.92] font-medium tracking-[-0.045em]")}>
              Let&apos;s make it
              <br />
              <span className="text-black/30">unforgettable.</span>
            </p>
            <p className={cn("mt-6 max-w-md text-base leading-relaxed", MUTED)}>
              Found your date? Call or message {bizName} to book your wedding car — we&apos;ll hold the car and plan the route
              with you.
            </p>
          </Reveal>
          <ul className="grid gap-3 *:min-w-0">
            {items.map((it, i) => (
              <Reveal as="li" key={it.label} delay={i * 80}>
                <a
                  href={it.href}
                  {...(it.external ? { target: "_blank", rel: "noreferrer" } : {})}
                  className="group flex items-center gap-4 rounded-2xl border border-black/[0.07] bg-[#F7F4EF] p-4 transition hover:-translate-y-0.5 hover:border-black/20 hover:bg-white"
                >
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white shadow-sm transition group-hover:bg-[#16120E] group-hover:text-white">
                    <it.icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-xs tracking-[0.2em] uppercase", MUTED)}>{it.label}</span>
                    <span className="block text-base font-medium [overflow-wrap:anywhere]">{it.value}</span>
                  </span>
                  <ArrowUpRightIcon className="size-5 shrink-0 opacity-40 transition group-hover:opacity-100" aria-hidden />
                </a>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

export function SiteFooter({ bizName, year, cars }: { bizName: string; year: string; cars: PublicCar[] }) {
  return (
    <footer className="px-3 pb-6 sm:px-4">
      <div className={cn("mx-auto grid max-w-[88rem] gap-4 px-2 pt-4 text-sm", MUTED)}>
        {cars.length > 0 && (
          <nav aria-label="Our wedding cars" className="flex flex-wrap gap-x-4 gap-y-1">
            {cars.map((c) => (
              <a key={c.id} href={carPath(c)} className="hover:text-[#16120E] hover:underline">
                {c.name} ({c.color})
              </a>
            ))}
          </nav>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <Image src="/logo.png" alt={`${bizName} logo`} width={28} height={28} className="size-7" />
            {bizName}
          </span>
          <span>© {year} · Wedding car hire · Ja-Ela, Sri Lanka</span>
        </div>
      </div>
    </footer>
  )
}
