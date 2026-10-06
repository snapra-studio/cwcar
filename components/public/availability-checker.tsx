"use client"

import * as React from "react"
import { CheckIcon, SearchIcon } from "lucide-react"

import { CarPhoto } from "@/components/bridal/car-art"
import { CinematicFilm, FilmNav, wordmark } from "@/components/public/cinematic-film"
import { FAQ, WHY_US } from "@/components/public/content"
import { display } from "@/components/public/fonts"
import { GoogleReviewsSection } from "@/components/public/google-reviews"
import { FleetSpotlight } from "@/components/public/fleet-spotlight"
import { Reveal } from "@/components/public/motion"
import {
  Chip,
  Contact,
  EYEBROW,
  INK,
  MUTED,
  STYLE_LABEL,
  SiteFooter,
  carAlt,
  carPath,
  type PublicBusiness,
  type PublicCar,
} from "@/components/public/site-parts"
import type { CarStyle } from "@/lib/bridal/types"
import { cn } from "@/lib/utils"

// The customer website's home page (no login). Everything shown comes from
// the server render (app/page.tsx): our own fleet — never partner cars — and
// the public contact details. Availability is asked one car + one date at a
// time and answered only "Available" / "Not available".
//
// Opens with a full-screen film of the decorated car (cinematic-film.tsx),
// then the fleet gallery, "choose a car", the availability check, why us and
// FAQ, Google reviews and contact.

const FALLBACK_NAME = "Chrish Wedding Cars"

export function PublicHome({
  today,
  business,
  cars,
  video,
}: {
  today: string
  business: PublicBusiness
  cars: PublicCar[]
  video?: string
}) {
  const [carId, setCarId] = React.useState("")
  const [query, setQuery] = React.useState("")
  const [type, setType] = React.useState<"" | CarStyle>("")
  const [colour, setColour] = React.useState("")
  const bizName = wordmark(business.name || FALLBACK_NAME)

  const q = query.trim().toLowerCase()
  const colourOf = (c: PublicCar) => c.color.trim().toLowerCase()
  const shown = cars.filter(
    (c) =>
      (!q || `${c.name} ${c.color} ${STYLE_LABEL[c.style]}`.toLowerCase().includes(q)) &&
      (!type || c.style === type) &&
      (!colour || colourOf(c) === colour)
  )
  const types = [...new Set(cars.map((c) => c.style))]
  const colours = [...new Set(cars.map(colourOf))].sort()
  const hexOf = (col: string) => cars.find((c) => colourOf(c) === col)?.hex ?? "#ccc"
  const filtersOn = !!(q || type || colour)

  // "Check dates": choose the car in the form at the top and go there.
  function pickCar(id: string) {
    setCarId(id)
    const form = document.getElementById("check")
    form?.scrollIntoView({ behavior: "smooth", block: "center" })
    setTimeout(() => (document.getElementById("hc-date") as HTMLInputElement | null)?.focus({ preventScroll: true }), 600)
  }

  return (
    <div id="top" className={cn("relative min-h-svh overflow-x-clip bg-[#F7F4EF] selection:bg-[#E9D7B8]", INK)}>
      <FilmNav bizName={bizName} />

      <main>
        <CinematicFilm bizName={bizName} video={video} phone={business.phone} cars={cars} today={today} carId={carId} onCarChange={setCarId} />
        <FleetGallery cars={cars} onPick={pickCar} />

        {/* ---------- Step 1: choose a car ---------- */}
        <section id="availability" aria-labelledby="avail-title" className="scroll-mt-24 px-3 py-6 sm:px-4">
          <div className="mx-auto max-w-[88rem] rounded-[2rem] border border-black/[0.06] bg-white px-5 py-10 shadow-[0_30px_80px_-40px_rgba(60,40,20,0.25)] sm:px-10 sm:py-14">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:items-end">
              <Reveal>
                <h2 id="avail-title" className={EYEBROW}>
                  Check wedding car availability
                </h2>
                <p className={cn(display.className, "text-5xl leading-[0.95] font-medium tracking-[-0.04em] sm:text-7xl")}>
                  Find your
                  <br />
                  <span className="text-black/30">perfect car</span>
                </p>
              </Reveal>
              <Reveal delay={120} className="grid gap-3">
                <label className="flex h-12 items-center gap-2 rounded-full border border-black/10 bg-[#F7F4EF] px-4 focus-within:border-black/30">
                  <SearchIcon className={cn("size-4", MUTED)} aria-hidden />
                  <input
                    type="search"
                    aria-label="Search cars"
                    placeholder="Search car name, model or type…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-[#9A9087]"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by type and colour">
                  <Chip on={!type} onClick={() => setType("")}>
                    All types
                  </Chip>
                  {types.map((t) => (
                    <Chip key={t} on={type === t} onClick={() => setType(type === t ? "" : t)}>
                      {STYLE_LABEL[t]}
                    </Chip>
                  ))}
                  <span className="mx-1 hidden h-6 w-px bg-black/10 sm:block" />
                  {colours.map((c) => (
                    <Chip key={c} on={colour === c} onClick={() => setColour(colour === c ? "" : c)} className="capitalize">
                      <span className="size-3 rounded-full border border-black/15" style={{ background: hexOf(c) }} aria-hidden />
                      {c}
                    </Chip>
                  ))}
                  {filtersOn && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("")
                        setType("")
                        setColour("")
                      }}
                      className="h-10 rounded-full px-3 text-sm font-medium underline-offset-4 hover:underline"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
                <p className={cn("text-sm", MUTED)}>
                  Tap <strong className="text-[#16120E]">Check dates</strong> on a car, then pick your date in the availability form at
                  the top of the page.
                </p>
              </Reveal>
            </div>

            {shown.length === 0 ? (
              <p className={cn("mt-8 rounded-3xl border border-dashed border-black/15 p-10 text-center", MUTED)}>
                {cars.length ? "No car matches your search." : "Our fleet will be listed here soon — call us to book."}
              </p>
            ) : (
              <ul id="cars" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((c, i) => {
                  const on = c.id === carId
                  return (
                    <Reveal as="li" key={c.id} delay={(i % 3) * 80}>
                      <article
                        className={cn(
                          "group/photo overflow-hidden rounded-3xl border bg-white transition duration-500 hover:-translate-y-1 hover:shadow-[0_24px_50px_-24px_rgba(60,40,20,0.35)]",
                          on ? "border-[#16120E] ring-2 ring-[#16120E]" : "border-black/[0.07]"
                        )}
                      >
                        <button type="button" onClick={() => pickCar(c.id)} aria-pressed={on} className="block w-full text-left">
                          <CarPhoto car={c} alt={carAlt(c)} className="aspect-[16/10]" sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw" />
                          <div className="flex items-end justify-between gap-3 p-4 pb-2">
                            <div className="min-w-0">
                              <h3 className="truncate text-lg font-medium">{c.name}</h3>
                              <p className={cn("text-sm capitalize", MUTED)}>
                                {c.color} · {STYLE_LABEL[c.style]}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                                on ? "border-[#16120E] bg-[#16120E] text-white" : "border-black/10 group-hover/photo:bg-[#16120E] group-hover/photo:text-white"
                              )}
                            >
                              {on ? <CheckIcon className="size-4" aria-hidden /> : null}
                              {on ? "Selected" : "Check dates"}
                            </span>
                          </div>
                        </button>
                        <a href={carPath(c)} className={cn("block px-4 pb-4 text-sm underline-offset-4 hover:underline", MUTED)}>
                          About the {c.name} →
                        </a>
                      </article>
                    </Reveal>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        <WhyUs />
        <GoogleReviewsSection />
        <Contact business={business} bizName={bizName} />
      </main>

      <SiteFooter bizName={bizName} year={today.slice(0, 4)} cars={cars} />
    </div>
  )
}

// ---------- Fleet: spotlight carousel (fleet-spotlight.tsx) ----------

function FleetGallery({ cars, onPick }: { cars: PublicCar[]; onPick: (id: string) => void }) {
  return (
    <section id="fleet" aria-labelledby="fleet-title" className="scroll-mt-24 overflow-hidden px-3 pt-10 pb-20 sm:px-4">
      <div className="mx-auto max-w-[88rem]">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6 px-2">
          <Reveal>
            <h2 id="fleet-title" className={EYEBROW}>
              Our wedding car fleet
            </h2>
            <p className={cn(display.className, "text-5xl leading-[0.95] font-medium tracking-[-0.04em] sm:text-7xl")}>
              Cars worth
              <br />
              <span className="text-black/30">remembering</span>
            </p>
          </Reveal>
          <Reveal delay={100} className={cn("max-w-xs text-sm leading-relaxed", MUTED)}>
            {cars.length ? `${cars.length} wedding cars, ` : ""}each photographed as it arrives on the day. Swipe or tap a car to bring
            it into the spotlight.
          </Reveal>
        </div>
        <Reveal delay={150}>
          <FleetSpotlight cars={cars} onPick={onPick} />
        </Reveal>
      </div>
    </section>
  )
}

// ---------- Why us + FAQ (also the page's FAQ structured data) ----------

function WhyUs() {
  return (
    <section id="about" aria-labelledby="about-title" className="scroll-mt-24 px-3 py-6 sm:px-4">
      <div className="mx-auto grid max-w-[88rem] gap-10 rounded-[2rem] border border-black/[0.06] bg-white px-6 py-14 sm:px-12 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="grid content-start gap-8">
          <Reveal>
            <h2 id="about-title" className={cn(display.className, "text-[clamp(2rem,5vw,3.5rem)] leading-[1] font-medium tracking-[-0.035em]")}>
              Wedding car hire in Ja-Ela, Sri Lanka
            </h2>
            <p className={cn("mt-4 max-w-lg text-base leading-relaxed", MUTED)}>
              Luxury sedans, vintage classics and SUVs for your wedding day, homecoming or special event — based in Ja-Ela and
              driving to churches, temples, hotels and reception venues around Gampaha, Negombo and Colombo.
            </p>
          </Reveal>
          <ul className="grid gap-5">
            {WHY_US.map((w, i) => (
              <Reveal as="li" key={w.title} delay={i * 80}>
                <h3 className="text-lg font-medium">{w.title}</h3>
                <p className={cn("mt-1 text-sm leading-relaxed", MUTED)}>{w.text}</p>
              </Reveal>
            ))}
          </ul>
        </div>
        <Reveal delay={100}>
          <h2 className={cn("mb-4", EYEBROW)}>Frequently asked questions</h2>
          <div className="grid gap-2">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-2xl border border-black/[0.07] bg-[#F7F4EF] p-4 open:bg-white">
                <summary className="cursor-pointer list-none font-medium marker:hidden">
                  <h3 className="inline">{f.q}</h3>
                </summary>
                <p className={cn("mt-2 text-sm leading-relaxed", MUTED)}>{f.a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
