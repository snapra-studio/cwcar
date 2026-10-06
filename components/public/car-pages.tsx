"use client"

import * as React from "react"
import { ArrowUpRightIcon, ChevronRightIcon } from "lucide-react"

import { CarPhoto } from "@/components/bridal/car-art"
import { AvailabilityCheck } from "@/components/public/availability-check"
import { FilmNav, wordmark } from "@/components/public/cinematic-film"
import { WHY_US } from "@/components/public/content"
import { display } from "@/components/public/fonts"
import { Reveal } from "@/components/public/motion"
import {
  Contact,
  EYEBROW,
  INK,
  MUTED,
  PILL_DARK,
  STYLE_LABEL,
  SiteFooter,
  carAlt,
  carPath,
  type PublicBusiness,
  type PublicCar,
} from "@/components/public/site-parts"
import { cn } from "@/lib/utils"

const STYLE_WORDS = { sedan: "luxury sedan", vintage: "vintage classic", suv: "SUV" } as const

function Shell({ business, cars, today, children }: { business: PublicBusiness; cars: PublicCar[]; today: string; children: React.ReactNode }) {
  const bizName = wordmark(business.name || "Chrish Wedding Cars")
  return (
    <div className={cn("relative min-h-svh overflow-x-clip bg-[#F7F4EF] pt-24 selection:bg-[#E9D7B8]", INK)}>
      <FilmNav bizName={bizName} />
      <main>
        {children}
        <Contact business={business} bizName={bizName} />
      </main>
      <SiteFooter bizName={bizName} year={today.slice(0, 4)} cars={cars} />
    </div>
  )
}

function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("mx-auto max-w-[88rem] px-5 pt-4 pb-2 text-sm sm:px-6", MUTED)}>
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((it, i) => (
          <li key={it.label} className="flex items-center gap-1">
            {i > 0 && <ChevronRightIcon className="size-3.5" aria-hidden />}
            {it.href ? (
              <a href={it.href} className="hover:text-[#16120E] hover:underline">
                {it.label}
              </a>
            ) : (
              <span aria-current="page" className="text-[#16120E]">
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

function CarGrid({ cars, exclude }: { cars: PublicCar[]; exclude?: string }) {
  const list = cars.filter((c) => c.id !== exclude)
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((c, i) => (
        <Reveal as="li" key={c.id} delay={(i % 3) * 80}>
          <a
            href={carPath(c)}
            className="group/photo block overflow-hidden rounded-3xl border border-black/[0.07] bg-white transition duration-500 hover:-translate-y-1 hover:shadow-[0_24px_50px_-24px_rgba(60,40,20,0.35)]"
          >
            <CarPhoto car={c} alt={carAlt(c)} className="aspect-[16/10]" sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw" />
            <div className="flex items-end justify-between gap-3 p-4">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-medium">{c.name}</h3>
                <p className={cn("text-sm capitalize", MUTED)}>
                  {c.color} · {STYLE_LABEL[c.style]}
                </p>
              </div>
              <span className="grid size-10 shrink-0 place-items-center rounded-full border border-black/10 transition-colors group-hover/photo:bg-[#16120E] group-hover/photo:text-white">
                <ArrowUpRightIcon className="size-4" aria-hidden />
              </span>
            </div>
          </a>
        </Reveal>
      ))}
    </ul>
  )
}

export function FleetIndex({ business, cars, today }: { business: PublicBusiness; cars: PublicCar[]; today: string }) {
  return (
    <Shell business={business} cars={cars} today={today}>
      <Crumbs items={[{ label: "Home", href: "/" }, { label: "Wedding cars" }]} />
      <section aria-labelledby="fleet-h1" className="px-3 pb-6 sm:px-4">
        <div className="mx-auto max-w-[88rem] rounded-[2rem] border border-black/[0.06] bg-white px-5 py-10 sm:px-10 sm:py-14">
          <h1 id="fleet-h1" className={cn(display.className, "text-[clamp(2.25rem,6vw,4.5rem)] leading-[0.98] font-medium tracking-[-0.04em]")}>
            Our wedding cars for hire
          </h1>
          <p className={cn("mt-4 max-w-2xl text-base leading-relaxed", MUTED)}>
            {cars.length} luxury and classic wedding cars, decorated with fresh or artificial flowers and driven by professional
            chauffeurs, for weddings and homecomings in Ja-Ela and around Sri Lanka&apos;s Western Province. Choose a car to see it and
            check if it&apos;s free on your date.
          </p>
          <div className="mt-8">
            <CarGrid cars={cars} />
          </div>
        </div>
      </section>
    </Shell>
  )
}

export function CarDetail({ car, business, cars, today }: { car: PublicCar; business: PublicBusiness; cars: PublicCar[]; today: string }) {
  const others = cars.filter((c) => c.id !== car.id)
  return (
    <Shell business={business} cars={cars} today={today}>
      <Crumbs items={[{ label: "Home", href: "/" }, { label: "Wedding cars", href: "/wedding-cars" }, { label: `${car.color} ${car.name}` }]} />
      <article aria-labelledby="car-h1" className="px-3 pb-6 sm:px-4">
        <div className="mx-auto grid max-w-[88rem] gap-8 rounded-[2rem] border border-black/[0.06] bg-white p-5 sm:p-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-center">
          <div className="overflow-hidden rounded-3xl">
            <CarPhoto car={car} alt={carAlt(car)} priority className="aspect-[16/10]" sizes="(min-width: 1024px) 55vw, 100vw" />
          </div>
          <div className="grid gap-5">
            <p className={EYEBROW}>
              {STYLE_LABEL[car.style]} · {car.color}
            </p>
            <h1 id="car-h1" className={cn(display.className, "-mt-3 text-[clamp(2.25rem,5vw,4rem)] leading-[0.98] font-medium tracking-[-0.04em]")}>
              {car.color} {car.name} wedding car hire
            </h1>
            <p className={cn("text-base leading-relaxed", MUTED)}>
              Arrive in our {car.color.toLowerCase()} {car.name}, a {STYLE_WORDS[car.style]} kept spotless for weddings, homecomings
              and special events in Ja-Ela, Gampaha, Negombo and Colombo. It comes decorated with fresh or artificial flowers in your
              colours, with a professional chauffeur who plans every pick-up and photo stop with you.
            </p>
            <ul className="grid gap-2 text-sm">
              {WHY_US.map((w) => (
                <li key={w.title} className="flex gap-2">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#C9A46A]" />
                  <span>
                    <strong className="font-medium">{w.title}.</strong> <span className={MUTED}>{w.text}</span>
                  </span>
                </li>
              ))}
            </ul>
            <a href="#calendar" className={cn(PILL_DARK, "w-fit")}>
              Check if it&apos;s free on your date
            </a>
          </div>
        </div>
      </article>

      <section id="calendar" aria-labelledby="car-cal" className="scroll-mt-24 px-3 py-6 sm:px-4">
        <AvailabilityCheck
          cars={cars}
          today={today}
          carId={car.id}
          phone={business.phone}
          headingId="car-cal"
          heading={`Is the ${car.name} free on your date?`}
        />
      </section>

      {others.length > 0 && (
        <section aria-labelledby="more-cars" className="px-3 py-6 sm:px-4">
          <div className="mx-auto max-w-[88rem] rounded-[2rem] border border-black/[0.06] bg-white px-5 py-10 sm:px-10">
            <h2 id="more-cars" className={cn(display.className, "mb-6 text-3xl font-medium tracking-[-0.03em]")}>
              More wedding cars
            </h2>
            <CarGrid cars={cars} exclude={car.id} />
          </div>
        </section>
      )}
    </Shell>
  )
}
