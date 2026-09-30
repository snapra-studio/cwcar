"use client"

import * as React from "react"
import Image from "next/image"
import { Playfair_Display } from "next/font/google"
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  CarFrontIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GemIcon,
  HeartIcon,
  MailIcon,
  MapPinIcon,
  MenuIcon,
  MessageCircleIcon,
  PaletteIcon,
  PhoneIcon,
  SearchIcon,
  ShieldCheckIcon,
  XIcon,
} from "lucide-react"

import { CarPhoto } from "@/components/bridal/car-art"
import { Skeleton } from "@/components/ui/skeleton"
import { MONTHS, fmtDate, pad, parseIso, toIso } from "@/lib/bridal/format"
import type { CarStyle } from "@/lib/bridal/types"
import { cn } from "@/lib/utils"

// Public "Check availability" page for customers (no login). All data comes
// from /api/availability, which only exposes car names/photos, booked dates
// and the business's public contact details.

const serif = Playfair_Display({ subsets: ["latin"], weight: ["400", "500", "600"] })

type PublicCar = { id: string; name: string; color: string; hex: string; style: CarStyle; image?: string }
type Business = { name: string; phone: string; email: string; address: string }
type Data = { business: Business; cars: PublicCar[]; booked: Record<string, string[]> }

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const STYLE_LABEL: Record<CarStyle, string> = { sedan: "Sedan", vintage: "Vintage", suv: "SUV" }
const tel = (p: string) => `tel:${p.replace(/\s/g, "")}`
// "070 10 71 777" -> "94701071777" for WhatsApp (Sri Lanka).
const wa = (p: string) => {
  const d = p.replace(/\D/g, "")
  return `https://wa.me/${d.startsWith("0") ? `94${d.slice(1)}` : d}`
}

const FEATURES = [
  { icon: GemIcon, title: "Premium Fleet", text: "Luxury & classic cars" },
  { icon: CalendarDaysIcon, title: "Easy Availability Check", text: "See real-time availability" },
  { icon: HeartIcon, title: "Perfect for Your Special Day", text: "Weddings · Homecomings · Events" },
  { icon: ShieldCheckIcon, title: "Trusted & Reliable", text: "Professional service" },
]

export function AvailabilityChecker({ today }: { today: string }) {
  const [view, setView] = React.useState(() => {
    const d = parseIso(today)
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [date, setDate] = React.useState(today)
  const [carId, setCarId] = React.useState("")
  const [query, setQuery] = React.useState("")
  const [type, setType] = React.useState<"" | CarStyle>("")
  const [colour, setColour] = React.useState("")
  const [data, setData] = React.useState<Data | null>(null)
  const [error, setError] = React.useState("")
  const [heroOk, setHeroOk] = React.useState(true)
  const [menuOpen, setMenuOpen] = React.useState(false)

  // Load the visible month.
  React.useEffect(() => {
    const from = `${view.y}-${pad(view.m + 1)}-01`
    const to = toIso(new Date(view.y, view.m + 1, 0))
    const ctrl = new AbortController()
    fetch(`/api/availability?from=${from}&to=${to}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad"))))
      .then((d: Data) => {
        setData(d)
        setError("")
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError("Couldn't load availability. Check your connection and try again.")
      })
    return () => ctrl.abort()
  }, [view])

  const cars = data?.cars ?? []
  const booked = data?.booked ?? {}
  const business = data?.business
  const isBooked = (id: string, day: string) => (booked[day] ?? []).includes(id)
  const q = query.trim().toLowerCase()
  const colourOf = (c: PublicCar) => c.color.trim().toLowerCase()
  const shown = cars.filter(
    (c) =>
      (!q || `${c.name} ${c.color} ${STYLE_LABEL[c.style]}`.toLowerCase().includes(q)) &&
      (!type || c.style === type) &&
      (!colour || colourOf(c) === colour)
  )
  const selected = cars.find((c) => c.id === carId)
  const types = [...new Set(cars.map((c) => c.style))]
  const colours = [...new Set(cars.map(colourOf))].sort()

  const first = new Date(view.y, view.m, 1)
  const lead = (first.getDay() + 6) % 7
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const move = (d: number) =>
    setView((v) => ({ y: v.m + d < 0 ? v.y - 1 : v.m + d > 11 ? v.y + 1 : v.y, m: (v.m + d + 12) % 12 }))
  const todayDate = parseIso(today)
  const atStart = view.y === todayDate.getFullYear() && view.m === todayDate.getMonth()
  // Answers need the selected date's month to be loaded.
  const dateLoaded = date.startsWith(`${view.y}-${pad(view.m + 1)}`)
  const freeOn = (day: string) => cars.length - (booked[day]?.length ?? 0)
  const status = selected && dateLoaded ? (isBooked(selected.id, date) ? "booked" : "free") : null

  function pickCar(id: string) {
    setCarId((cur) => (cur === id ? "" : id))
    document.getElementById("calendar")?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }

  const navLinks = [
    { label: "Home", href: "#top" },
    { label: "Our Cars", href: "#cars" },
    { label: "Check Availability", href: "#availability", active: true },
    { label: "Contact", href: "#contact" },
  ]

  return (
    <div id="top" className="relative isolate min-h-svh overflow-hidden bg-[#FBF6EE] text-[#3F2A17]">
      {/* ---------- Decoration ---------- */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 -left-40 size-[34rem] rounded-full bg-[radial-gradient(circle,#F3D9D2_0%,transparent_65%)] opacity-70 blur-2xl" />
        <div className="absolute top-[45%] -left-48 size-[30rem] rounded-full bg-[radial-gradient(circle,#F6E7D2_0%,transparent_65%)] blur-2xl" />
        <div className="absolute -right-40 bottom-10 size-[32rem] rounded-full bg-[radial-gradient(circle,#F4E3CF_0%,transparent_65%)] blur-2xl" />
        <Image src="/floral-gold.svg" alt="" width={420} height={520} className="absolute right-0 bottom-0 w-64 opacity-80 md:w-96" />
        <Image src="/floral-gold.svg" alt="" width={420} height={520} className="absolute top-40 -left-10 w-40 -scale-x-100 rotate-12 opacity-40 md:w-56" />
      </div>

      {/* Hero photo, faded into the page */}
      {heroOk && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-16 right-0 -z-10 hidden h-[32rem] w-[56%] lg:block [mask-image:radial-gradient(ellipse_72%_70%_at_68%_52%,black_42%,transparent_76%)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- served from our API, may 404 */}
          <img src="/api/public/hero" alt="" className="size-full object-cover" onError={() => setHeroOk(false)} />
        </div>
      )}

      {/* ---------- Top bar ---------- */}
      <header className="relative z-20 mx-auto flex max-w-7xl items-center gap-6 px-4 py-4 md:px-8">
        <a href="#top" className="flex shrink-0 items-center gap-2.5">
          <Image src="/logo.png" alt="Chrish Wedding Hires" width={64} height={64} priority className="size-14 md:size-16" />
          <span className="hidden leading-tight sm:block">
            <span className={cn(serif.className, "block text-lg font-semibold")}>{business?.name ?? "Chrish Wedding Hires"}</span>
            <span className="block text-[10px] tracking-[0.25em] text-[#9A7445] uppercase">Ja-Ela · Sri Lanka</span>
          </span>
        </a>
        <nav aria-label="Main" className="mx-auto hidden items-center gap-8 text-sm font-medium lg:flex">
          {navLinks.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className={cn(
                "relative py-1 transition-colors hover:text-[#9A6A36]",
                l.active && "font-semibold after:absolute after:inset-x-0 after:-bottom-1 after:h-0.5 after:bg-[#A8703E]"
              )}
            >
              {l.label}
            </a>
          ))}
        </nav>
        {business?.phone && (
          <a
            href={tel(business.phone)}
            className="ml-auto hidden items-center gap-2 rounded-full bg-[#8A5A2B] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#8A5A2B]/25 transition-colors hover:bg-[#744A22] sm:inline-flex lg:ml-0"
          >
            <PhoneIcon className="size-4" />
            {business.phone}
          </a>
        )}
        <button
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
          className="ml-auto grid size-11 place-items-center rounded-full hover:bg-[#8A5A2B]/10 sm:ml-0 lg:hidden"
        >
          {menuOpen ? <XIcon className="size-6" /> : <MenuIcon className="size-6" />}
        </button>
        {menuOpen && (
          <nav className="absolute inset-x-4 top-full grid gap-1 rounded-2xl border border-[#E7D6BF] bg-white p-2 shadow-xl lg:hidden">
            {navLinks.map((l) => (
              <a key={l.label} href={l.href} onClick={() => setMenuOpen(false)} className="rounded-xl px-4 py-3 font-medium hover:bg-[#F5ECDF]">
                {l.label}
              </a>
            ))}
            {business?.phone && (
              <a href={tel(business.phone)} className="flex items-center gap-2 rounded-xl bg-[#8A5A2B] px-4 py-3 font-semibold text-white">
                <PhoneIcon className="size-4" />
                Call {business.phone}
              </a>
            )}
          </nav>
        )}
      </header>

      <main className="relative z-10 mx-auto grid max-w-7xl gap-6 px-4 pb-10 md:px-8">
        {/* ---------- Heading ---------- */}
        <section className="grid animate-in gap-3 pt-4 duration-700 fade-in slide-in-from-bottom-4 md:pt-8 lg:max-w-[46%] lg:pl-24">
          <p className="text-xs font-medium tracking-[0.35em] text-[#B08450] uppercase">Wedding car hire</p>
          <h1 className={cn(serif.className, "text-5xl leading-[1.05] font-normal tracking-tight text-[#2E1F12] sm:text-6xl xl:text-7xl")}>
            Check Availability
          </h1>
          <p className="flex items-center gap-4 text-[11px] font-medium tracking-[0.3em] text-[#B08450] uppercase">
            <span className="h-px w-14 shrink-0 bg-[#B08450]" />
            Your special day deserves a special ride
          </p>
        </section>

        {/* ---------- Result ---------- */}
        <section
          id="availability"
          aria-live="polite"
          className={cn(
            "grid animate-in scroll-mt-4 items-center gap-4 rounded-2xl border bg-white/85 p-5 shadow-lg shadow-[#8A5A2B]/5 backdrop-blur-md delay-100 duration-700 fade-in fill-mode-both slide-in-from-bottom-4 sm:grid-cols-[auto_1fr_auto] sm:p-6 lg:max-w-[62%]",
            status === "booked" ? "border-destructive/30" : status === "free" ? "border-emerald-600/30" : "border-[#EDE0CD]"
          )}
        >
          <span
            className={cn(
              "hidden size-12 place-items-center rounded-xl sm:grid",
              status === "booked"
                ? "bg-destructive/10 text-destructive"
                : status === "free"
                  ? "bg-emerald-600/10 text-emerald-700"
                  : "bg-[#F5ECDF] text-[#8A5A2B]"
            )}
          >
            {status === "booked" ? <XIcon className="size-6" /> : status === "free" ? <CheckIcon className="size-6" /> : <CalendarDaysIcon className="size-6" />}
          </span>
          <div className="min-w-0">
            <p className="text-sm text-[#7A6149]">
              {fmtDate(date)}
              {selected ? ` · ${selected.name}` : ""}
            </p>
            {!data ? (
              <Skeleton className="mt-1 h-7 w-64" />
            ) : status === "booked" ? (
              <p className="text-lg font-bold text-destructive sm:text-xl">Not available — booked on this date</p>
            ) : status === "free" ? (
              <p className="text-lg font-bold text-emerald-700 sm:text-xl">Available on this date!</p>
            ) : selected ? (
              <p className="text-xl font-semibold">Pick the date again on the calendar.</p>
            ) : (
              <p className="text-lg font-semibold sm:text-xl">
                {dateLoaded ? `${freeOn(date)} of ${cars.length} cars available — pick a car below.` : "Pick a date and a car."}
              </p>
            )}
          </div>
          {business?.phone && (
            <a
              href={tel(business.phone)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#8A5A2B] px-5 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[#744A22]"
            >
              <PhoneIcon className="size-4" />
              Call {business.phone} to book
              <ArrowRightIcon className="size-4" />
            </a>
          )}
        </section>

        {/* ---------- Calendar + cars ---------- */}
        <section className="grid animate-in overflow-hidden rounded-3xl border border-[#EDE0CD] bg-white/90 shadow-xl shadow-[#8A5A2B]/10 backdrop-blur-md delay-200 duration-700 fade-in fill-mode-both slide-in-from-bottom-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
          <div id="calendar" className="scroll-mt-4 border-b border-[#EDE0CD] p-4 sm:p-6 lg:border-r lg:border-b-0">
            <div className="mb-4 flex items-center justify-between gap-2">
              <button
                type="button"
                aria-label="Previous month"
                disabled={atStart}
                onClick={() => move(-1)}
                className="grid size-10 place-items-center rounded-full border border-[#E7D6BF] transition-colors hover:bg-[#F5ECDF] disabled:opacity-35"
              >
                <ChevronLeftIcon className="size-5" />
              </button>
              <h2 className="text-lg font-semibold">
                {MONTHS[view.m]} {view.y}
              </h2>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => move(1)}
                className="grid size-10 place-items-center rounded-full border border-[#E7D6BF] transition-colors hover:bg-[#F5ECDF]"
              >
                <ChevronRightIcon className="size-5" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1.5 pb-2 text-center text-[11px] tracking-widest text-[#9C8670] uppercase">
              {WEEKDAYS.map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {Array.from({ length: lead }, (_, i) => (
                <div key={`lead-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = `${view.y}-${pad(view.m + 1)}-${pad(i + 1)}`
                const past = day < today
                const on = day === date
                const busy = selected ? isBooked(selected.id, day) : false
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={past}
                    aria-pressed={on}
                    aria-label={`${fmtDate(day)}${selected ? (busy ? ", booked" : ", available") : `, ${freeOn(day)} cars free`}`}
                    onClick={() => setDate(day)}
                    className={cn(
                      "flex aspect-square flex-col items-center justify-center rounded-2xl text-sm font-medium transition outline-none focus-visible:ring-3 focus-visible:ring-[#A8703E]/40 disabled:opacity-35 sm:text-base",
                      on
                        ? "bg-[#8A5A2B] text-white shadow-lg shadow-[#8A5A2B]/30"
                        : past
                          ? "text-[#B7A48E]"
                          : selected
                            ? busy
                              ? "bg-destructive/10 text-destructive hover:bg-destructive/15"
                              : "bg-emerald-600/10 text-emerald-800 hover:bg-emerald-600/15"
                            : "bg-[#FAF4EC] shadow-sm hover:bg-[#F3E7D6]"
                    )}
                  >
                    {i + 1}
                    {on && data && !selected && <span className="text-[10px] font-normal opacity-85">{freeOn(day)} free</span>}
                    {on && data && selected && (
                      <span className="text-[10px] font-normal opacity-85">{busy ? "booked" : "free"}</span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#7A6149]">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded bg-emerald-500" /> Available
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded bg-rose-400" /> Booked
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded bg-[#EDE3D6]" />
                {selected ? `Showing ${selected.name}` : "Pick a car to colour its dates"}
              </span>
            </div>
          </div>

          <div id="cars" className="grid scroll-mt-4 content-start gap-4 p-4 sm:p-6">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <label className="flex h-11 items-center gap-2 rounded-full border border-[#E7D6BF] bg-white px-4 focus-within:ring-3 focus-within:ring-[#A8703E]/30">
                <SearchIcon className="size-4 text-[#9C8670]" />
                <input
                  type="search"
                  aria-label="Search cars"
                  placeholder="Search car name, model or type…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-[#A9967F]"
                />
              </label>
              <label className="flex h-11 items-center gap-2 rounded-full border border-[#E7D6BF] bg-white pr-2 pl-4">
                <CarFrontIcon className="size-4 text-[#9C8670]" />
                <select
                  aria-label="Car type"
                  value={type}
                  onChange={(e) => setType(e.target.value as "" | CarStyle)}
                  className="bg-transparent pr-1 text-sm outline-none"
                >
                  <option value="">All types</option>
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {STYLE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex h-11 items-center gap-2 rounded-full border border-[#E7D6BF] bg-white pr-2 pl-4">
                <PaletteIcon className="size-4 text-[#9C8670]" />
                <select aria-label="Colour" value={colour} onChange={(e) => setColour(e.target.value)} className="bg-transparent pr-1 text-sm capitalize outline-none">
                  <option value="">All colours</option>
                  {colours.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {!data && !error ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-56 rounded-2xl" />
                <Skeleton className="h-56 rounded-2xl" />
              </div>
            ) : shown.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[#E7D6BF] p-8 text-center text-[#7A6149]">No car matches your search.</p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {shown.map((c) => {
                  const busy = dateLoaded && isBooked(c.id, date)
                  const on = c.id === carId
                  return (
                    <li
                      key={c.id}
                      className={cn(
                        "group/photo overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg",
                        on ? "border-[#A8703E] ring-2 ring-[#A8703E]" : "border-[#EDE0CD]"
                      )}
                    >
                      <button type="button" onClick={() => pickCar(c.id)} aria-pressed={on} className="block w-full text-left">
                        <div className="relative">
                          <CarPhoto car={c} className="aspect-[16/9]" sizes="(min-width: 1024px) 26vw, (min-width: 640px) 50vw, 100vw" />
                          {dateLoaded && (
                            <span
                              className={cn(
                                "absolute top-3 right-3 rounded-full px-3 py-1 text-[11px] font-bold tracking-widest text-white uppercase shadow-md",
                                busy ? "bg-rose-600" : "bg-emerald-600"
                              )}
                            >
                              {busy ? "Booked" : "Available"}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2 p-3.5">
                          <div className="min-w-0">
                            <div className="truncate font-semibold">{c.name}</div>
                            <div className="text-sm text-[#7A6149] capitalize">
                              {c.color} · {STYLE_LABEL[c.style]}
                            </div>
                          </div>
                          <span
                            className={cn(
                              "inline-flex shrink-0 items-center gap-1 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                              on ? "border-[#8A5A2B] bg-[#8A5A2B] text-white" : "border-[#D9C3A5] text-[#8A5A2B] group-hover/photo:bg-[#F5ECDF]"
                            )}
                          >
                            {on ? "Selected" : "Check dates"}
                            <ArrowRightIcon className="size-3.5" />
                          </span>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      </main>

      {/* ---------- Features ---------- */}
      <section className="relative z-10 border-t border-[#EDE0CD] bg-white/60 backdrop-blur-sm">
        <ul className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-7 md:px-8 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <li key={f.title} className="flex items-center gap-3">
              <f.icon className="size-8 shrink-0 text-[#A8703E]" strokeWidth={1.4} />
              <div>
                <div className="text-sm font-semibold">{f.title}</div>
                <div className="text-xs text-[#9C8670]">{f.text}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- Contact ---------- */}
      <footer id="contact" className="relative z-10 bg-[#3F2A17] text-[#F5ECDF]">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 md:grid-cols-[1fr_auto] md:px-8">
          <div>
            <p className={cn(serif.className, "text-2xl")}>{business?.name ?? "Chrish Wedding Hires"}</p>
            <p className="mt-1 text-sm text-[#D9C3A5]">Found your date? Call or message us to confirm your booking.</p>
          </div>
          {business && (
            <ul className="grid gap-2 text-sm sm:grid-cols-2 md:justify-items-start">
              {business.phone && (
                <li>
                  <a href={tel(business.phone)} className="inline-flex items-center gap-2 hover:text-white">
                    <PhoneIcon className="size-4" /> {business.phone}
                  </a>
                </li>
              )}
              {business.phone && (
                <li>
                  <a href={wa(business.phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 hover:text-white">
                    <MessageCircleIcon className="size-4" /> WhatsApp us
                  </a>
                </li>
              )}
              {business.email && (
                <li>
                  <a href={`mailto:${business.email}`} className="inline-flex items-center gap-2 break-all hover:text-white">
                    <MailIcon className="size-4 shrink-0" /> {business.email}
                  </a>
                </li>
              )}
              {business.address && (
                <li className="inline-flex items-center gap-2">
                  <MapPinIcon className="size-4 shrink-0" /> {business.address}
                </li>
              )}
            </ul>
          )}
        </div>
      </footer>
    </div>
  )
}
