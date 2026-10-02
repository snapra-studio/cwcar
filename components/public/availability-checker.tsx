"use client"

import * as React from "react"
import Image from "next/image"
import {
  ArrowUpRightIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  MailIcon,
  MapPinIcon,
  MessageCircleIcon,
  PhoneIcon,
  SearchIcon,
} from "lucide-react"

import { CarPhoto } from "@/components/bridal/car-art"
import { CinematicFilm, FilmNav } from "@/components/public/cinematic-film"
import { display } from "@/components/public/fonts"
import { GoogleReviewsSection } from "@/components/public/google-reviews"
import { Parallax, Reveal, Sparkle } from "@/components/public/motion"
import { Skeleton } from "@/components/ui/skeleton"
import { MONTHS, fmtDate, pad, parseIso, toIso } from "@/lib/bridal/format"
import { describeGap, fmtMinutes, freeGaps, overlaps, toMinutes } from "@/lib/bridal/logic"
import type { CarStyle } from "@/lib/bridal/types"
import { cn } from "@/lib/utils"

// Public "Check availability" page for customers (no login). All data comes
// from /api/availability, which only exposes car names/photos, booked time
// slots and the business's public contact details.
//
// Opens with a full-screen film of the decorated car and the "Find your
// date" message (components/public/cinematic-film.tsx), then a light editorial layout:
// a scattered fleet gallery that drifts on scroll, the availability filters,
// the calendar and contact.


type PublicCar = { id: string; name: string; color: string; hex: string; style: CarStyle; image?: string }
type Business = { name: string; phone: string; email: string; address: string }
// Booked time slots only ("YYYY-MM-DDTHH:MM"), no other hire details.
// `blocked`: the car is out of service then (the reason isn't shared).
type PublicSlot = { carId: string; start: string; end: string; blocked?: true }
type Data = { business: Business; cars: PublicCar[]; slots: PublicSlot[]; video?: string }
type DayState = "free" | "partial" | "booked"
type DaySlot = { start: number; end: number; blocked: boolean }

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const STYLE_LABEL: Record<CarStyle, string> = { sedan: "Sedan", vintage: "Vintage", suv: "SUV" }
const tel = (p: string) => `tel:${p.replace(/\s/g, "")}`
// "070 10 71 777" -> "94701071777" for WhatsApp (Sri Lanka).
const wa = (p: string) => {
  const d = p.replace(/\D/g, "")
  return `https://wa.me/${d.startsWith("0") ? `94${d.slice(1)}` : d}`
}
const mapLink = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
const UNAVOIDABLE = "not available due to an unavoidable reason"
const FALLBACK_NAME = "Chrish Wedding Hires"

const INK = "text-[#16120E]"
const MUTED = "text-[#6B6259]"
const PILL_DARK =
  "inline-flex items-center justify-center gap-2 rounded-full bg-[#16120E] px-5 py-3 text-sm font-medium text-white shadow-[0_10px_30px_-10px_rgba(22,18,14,0.6)] transition hover:-translate-y-0.5 hover:bg-black"
const PILL_LIGHT =
  "inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-medium text-[#16120E] shadow-sm transition hover:-translate-y-0.5 hover:border-black/20"

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
  // Optional time window to check, as "HH:MM".
  const [fromTime, setFromTime] = React.useState("")
  const [toTime, setToTime] = React.useState("")
  const [data, setData] = React.useState<Data | null>(null)
  const [error, setError] = React.useState("")

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
  const allSlots = data?.slots ?? []
  const business = data?.business
  const bizName = business?.name || FALLBACK_NAME
  // A car's booked slots on one day, in minutes and clipped to that day (a
  // hire past midnight shows on both days).
  const slotsOn = (id: string, day: string): DaySlot[] =>
    allSlots
      .filter((x) => x.carId === id && x.start.slice(0, 10) <= day && x.end.slice(0, 10) >= day)
      .map((x) => ({
        start: x.start.slice(0, 10) < day ? 0 : toMinutes(x.start.slice(11, 16)),
        end: x.end.slice(0, 10) > day ? 24 * 60 : toMinutes(x.end.slice(11, 16)),
        blocked: !!x.blocked,
      }))
      .filter((x) => x.end > x.start)
      .sort((a, b) => a.start - b.start)
  const winStart = toMinutes(fromTime)
  const winEnd = toMinutes(toTime)
  const hasWindow = !Number.isNaN(winStart) && !Number.isNaN(winEnd)
  const windowOk = hasWindow && winEnd > winStart
  const windowText = windowOk ? `${fmtMinutes(winStart)} – ${fmtMinutes(winEnd)}` : ""
  // With a time window: free/booked for that window. Without: free all day,
  // partly booked, or booked with no free time left.
  const dayState = (id: string, day: string): DayState => {
    const slots = slotsOn(id, day)
    if (windowOk) return slots.some((x) => overlaps(winStart, winEnd, x.start, x.end)) ? "booked" : "free"
    if (!slots.length) return "free"
    return freeGaps(slots).length ? "partial" : "booked"
  }
  const slotText = (x: { start: number; end: number }) => `${fmtMinutes(x.start)} – ${fmtMinutes(x.end)}`
  // Booked times and out-of-service times, described separately.
  const describeSlots = (list: DaySlot[]) =>
    [
      list.some((x) => !x.blocked) && `Booked ${list.filter((x) => !x.blocked).map(slotText).join(", ")}`,
      list.some((x) => x.blocked) && `${list.filter((x) => x.blocked).map(slotText).join(", ")} ${UNAVOIDABLE}`,
    ]
      .filter(Boolean)
      .join(" · ")
  const allDayOut = (list: DaySlot[]) => list.some((x) => x.blocked) && freeGaps(list.filter((x) => x.blocked)).length === 0
  const badgeText = (state: DayState, slots: DaySlot[]) =>
    state === "booked" && (windowOk ? slots.some((x) => x.blocked && overlaps(winStart, winEnd, x.start, x.end)) : allDayOut(slots))
      ? "Not available"
      : state === "booked"
        ? windowOk
          ? "Booked"
          : "Fully booked"
        : state === "partial"
          ? "Partly booked"
          : windowOk
            ? "Available"
            : "Free all day"

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
  const hexOf = (col: string) => cars.find((c) => colourOf(c) === col)?.hex ?? "#ccc"

  const first = new Date(view.y, view.m, 1)
  const lead = (first.getDay() + 6) % 7
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const move = (d: number) =>
    setView((v) => ({ y: v.m + d < 0 ? v.y - 1 : v.m + d > 11 ? v.y + 1 : v.y, m: (v.m + d + 12) % 12 }))
  const todayDate = parseIso(today)
  const atStart = view.y === todayDate.getFullYear() && view.m === todayDate.getMonth()
  // Answers need the selected date's month to be loaded.
  const dateLoaded = date.startsWith(`${view.y}-${pad(view.m + 1)}`)
  const freeOn = (day: string) => cars.filter((c) => dayState(c.id, day) === "free").length
  const status: DayState | null = selected && dateLoaded ? dayState(selected.id, date) : null
  const selSlots = selected && dateLoaded ? slotsOn(selected.id, date) : []
  const filtersOn = !!(q || type || colour || fromTime || toTime)

  function goDate(day: string) {
    if (!day) return
    setDate(day < today ? today : day)
    const d = parseIso(day < today ? today : day)
    setView({ y: d.getFullYear(), m: d.getMonth() })
  }

  function pickCar(id: string, scrollTo: "calendar" | "availability" = "calendar") {
    setCarId((cur) => (cur === id && scrollTo === "calendar" ? "" : id))
    document.getElementById(scrollTo)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  // The answer for the chosen car and date (or a summary with no car picked).
  function answer() {
    if (!data) return <Skeleton className="h-9 w-3/4" />
    if (selected && !dateLoaded) return <p className="text-2xl font-medium">Pick the date again on the calendar.</p>
    if (selected && windowOk) {
      return status === "booked" ? (
        <>
          <p className="text-2xl font-medium text-rose-700 sm:text-3xl">Not available {windowText}</p>
          <p className={cn("text-sm", MUTED)}>{describeSlots(selSlots.filter((x) => overlaps(winStart, winEnd, x.start, x.end)))}</p>
        </>
      ) : (
        <p className="text-2xl font-medium text-emerald-700 sm:text-3xl">Available {windowText}</p>
      )
    }
    if (selected) {
      if (!selSlots.length) return <p className="text-2xl font-medium text-emerald-700 sm:text-3xl">Free all day</p>
      if (allDayOut(selSlots)) return <p className="text-2xl font-medium text-rose-700 sm:text-3xl">Sorry — {UNAVOIDABLE} on this day</p>
      return (
        <div className="grid gap-1.5 text-base sm:text-lg">
          {selSlots.some((x) => !x.blocked) && (
            <p>
              <span className="font-medium text-rose-700">Booked</span> {selSlots.filter((x) => !x.blocked).map(slotText).join(", ")}
            </p>
          )}
          {selSlots.some((x) => x.blocked) && (
            <p>
              <span className="font-medium text-rose-700">Not available</span> {selSlots.filter((x) => x.blocked).map(slotText).join(", ")}{" "}
              <span className={MUTED}>(due to an unavoidable reason)</span>
            </p>
          )}
          <p>
            <span className="font-medium text-emerald-700">Available</span>{" "}
            {freeGaps(selSlots).map(describeGap).join(", ") || "no free time this day"}
          </p>
        </div>
      )
    }
    return (
      <p className="text-2xl font-medium sm:text-3xl">
        {!dateLoaded
          ? "Pick a date and a car."
          : windowOk
            ? `${freeOn(date)} of ${cars.length} cars available ${windowText}.`
            : `${freeOn(date)} of ${cars.length} cars free all day.`}
      </p>
    )
  }

  return (
    <div id="top" className={cn("relative min-h-svh overflow-x-clip bg-[#F7F4EF] selection:bg-[#E9D7B8]", INK)}>
      <FilmNav bizName={bizName} />

      <main>
        <CinematicFilm bizName={bizName} video={data?.video} phone={business?.phone} />
        <FleetGallery cars={cars} loading={!data && !error} onPick={(id) => pickCar(id, "availability")} />

        {/* ---------- Availability & filters ---------- */}
        <section id="availability" aria-labelledby="avail-title" className="scroll-mt-24 px-3 py-6 sm:px-4">
          <div className="mx-auto max-w-[88rem] rounded-[2rem] border border-black/[0.06] bg-white px-5 py-10 shadow-[0_30px_80px_-40px_rgba(60,40,20,0.25)] sm:px-10 sm:py-14">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:items-end">
              <Reveal>
                <p className={cn("mb-4 text-xs font-medium tracking-[0.3em] uppercase", MUTED)}>Availability</p>
                <h2 id="avail-title" className={cn(display.className, "text-5xl leading-[0.95] font-medium tracking-[-0.04em] sm:text-7xl")}>
                  Find your
                  <br />
                  <span className="text-black/30">perfect car</span>
                </h2>
              </Reveal>
              <Reveal delay={120} className="grid gap-3">
                <label className="flex h-12 items-center gap-2 rounded-full border border-black/10 bg-[#F7F4EF] px-4 focus-within:border-black/30">
                  <SearchIcon className={cn("size-4", MUTED)} />
                  <input
                    type="search"
                    aria-label="Search cars"
                    placeholder="Search car name, model or type…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-[#9A9087]"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Car type">
                  <Chip on={!type} onClick={() => setType("")}>
                    All types
                  </Chip>
                  {types.map((t) => (
                    <Chip key={t} on={type === t} onClick={() => setType(type === t ? "" : t)}>
                      {STYLE_LABEL[t]}
                    </Chip>
                  ))}
                  <span className="mx-1 hidden h-6 w-px bg-black/10 sm:block" />
                  <span className="sr-only">Colour</span>
                  {colours.map((c) => (
                    <Chip key={c} on={colour === c} onClick={() => setColour(colour === c ? "" : c)} className="capitalize">
                      <span className="size-3 rounded-full border border-black/15" style={{ background: hexOf(c) }} />
                      {c}
                    </Chip>
                  ))}
                </div>
                <div className="flex flex-wrap items-end gap-2 text-sm">
                  <label className="grid gap-1">
                    <span className={cn("px-1 text-xs", MUTED)}>Date</span>
                    <input
                      type="date"
                      aria-label="Date"
                      min={today}
                      value={date}
                      onChange={(e) => goDate(e.target.value)}
                      className="h-11 rounded-full border border-black/10 bg-white px-4 outline-none focus:border-black/30"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className={cn("px-1 text-xs", MUTED)}>From</span>
                    <input
                      type="time"
                      aria-label="From time"
                      value={fromTime}
                      onChange={(e) => setFromTime(e.target.value)}
                      className="h-11 rounded-full border border-black/10 bg-white px-4 outline-none focus:border-black/30"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className={cn("px-1 text-xs", MUTED)}>To</span>
                    <input
                      type="time"
                      aria-label="To time"
                      value={toTime}
                      onChange={(e) => setToTime(e.target.value)}
                      className="h-11 rounded-full border border-black/10 bg-white px-4 outline-none focus:border-black/30"
                    />
                  </label>
                  {filtersOn && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("")
                        setType("")
                        setColour("")
                        setFromTime("")
                        setToTime("")
                      }}
                      className="h-11 rounded-full px-4 font-medium underline-offset-4 hover:underline"
                    >
                      Clear filters
                    </button>
                  )}
                  {hasWindow && !windowOk && <span className="pb-3 text-rose-700">The end time must be after the start time.</span>}
                  {!hasWindow && <span className={cn("pb-3 text-xs", MUTED)}>Time is optional</span>}
                </div>
              </Reveal>
            </div>

            <div className="mt-10 flex flex-wrap items-baseline justify-between gap-2 border-t border-black/[0.07] pt-6" aria-live="polite">
              <div className="text-lg font-medium">
                {data ? (
                  <>
                    {fmtDate(date)}
                    {windowOk && ` · ${windowText}`}
                    <span className={cn("ml-2 font-normal", MUTED)}>
                      {dateLoaded ? `${shown.filter((c) => dayState(c.id, date) === "free").length} of ${shown.length} shown free` : ""}
                    </span>
                  </>
                ) : (
                  <Skeleton className="h-6 w-56" />
                )}
              </div>
              <p className={cn("text-sm", MUTED)}>Tap a car to see its calendar</p>
            </div>

            {error && <p className="mt-4 text-sm text-rose-700">{error}</p>}
            {!data && !error ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-72 rounded-3xl" />
                ))}
              </div>
            ) : shown.length === 0 ? (
              <p className={cn("mt-6 rounded-3xl border border-dashed border-black/15 p-10 text-center", MUTED)}>No car matches your search.</p>
            ) : (
              <ul id="cars" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((c, i) => {
                  const state = dateLoaded ? dayState(c.id, date) : "free"
                  const carSlots = dateLoaded ? slotsOn(c.id, date) : []
                  const on = c.id === carId
                  return (
                    <Reveal as="li" key={c.id} delay={(i % 3) * 80}>
                      <button
                        type="button"
                        onClick={() => pickCar(c.id)}
                        aria-pressed={on}
                        className={cn(
                          "group/photo block w-full overflow-hidden rounded-3xl border bg-white text-left transition duration-500 hover:-translate-y-1 hover:shadow-[0_24px_50px_-24px_rgba(60,40,20,0.35)]",
                          on ? "border-[#16120E] ring-2 ring-[#16120E]" : "border-black/[0.07]"
                        )}
                      >
                        <div className="relative">
                          <CarPhoto car={c} className="aspect-[16/10]" sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw" />
                          {dateLoaded && (
                            <span
                              className={cn(
                                "absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-medium shadow-sm backdrop-blur",
                                state === "booked" ? "text-rose-700" : state === "partial" ? "text-amber-700" : "text-emerald-700"
                              )}
                            >
                              <span
                                className={cn(
                                  "size-1.5 rounded-full",
                                  state === "booked" ? "bg-rose-600" : state === "partial" ? "bg-amber-500" : "bg-emerald-600"
                                )}
                              />
                              {badgeText(state, carSlots)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-end justify-between gap-3 p-4">
                          <div className="min-w-0">
                            <div className="truncate text-lg font-medium">{c.name}</div>
                            <div className={cn("text-sm capitalize", MUTED)}>
                              {c.color} · {STYLE_LABEL[c.style]}
                            </div>
                            {carSlots.length > 0 && !windowOk && <div className={cn("mt-1 text-xs", MUTED)}>{describeSlots(carSlots)}</div>}
                          </div>
                          <span
                            className={cn(
                              "grid size-10 shrink-0 place-items-center rounded-full border transition-colors",
                              on ? "border-[#16120E] bg-[#16120E] text-white" : "border-black/10 group-hover/photo:bg-[#16120E] group-hover/photo:text-white"
                            )}
                            aria-hidden
                          >
                            {on ? <CheckIcon className="size-4" /> : <ArrowUpRightIcon className="size-4" />}
                          </span>
                        </div>
                      </button>
                    </Reveal>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        {/* ---------- Calendar ---------- */}
        <section id="calendar" aria-labelledby="cal-title" className="scroll-mt-24 px-3 py-6 sm:px-4">
          <div className="mx-auto grid max-w-[88rem] gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <Reveal className="rounded-[2rem] border border-black/[0.06] bg-white p-5 sm:p-8">
              <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                  <p className={cn("text-xs font-medium tracking-[0.3em] uppercase", MUTED)}>Calendar</p>
                  <h2 id="cal-title" className={cn(display.className, "mt-1 text-3xl font-medium tracking-[-0.03em] sm:text-4xl")}>
                    {MONTHS[view.m]} <span className="text-black/30">{view.y}</span>
                  </h2>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-label="Previous month"
                    disabled={atStart}
                    onClick={() => move(-1)}
                    className="grid size-11 place-items-center rounded-full border border-black/10 transition hover:bg-[#16120E] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                  >
                    <ChevronLeftIcon className="size-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next month"
                    onClick={() => move(1)}
                    className="grid size-11 place-items-center rounded-full border border-black/10 transition hover:bg-[#16120E] hover:text-white"
                  >
                    <ChevronRightIcon className="size-5" />
                  </button>
                </div>
              </div>
              <div className={cn("grid grid-cols-7 gap-1.5 pb-2 text-center text-[11px] tracking-widest uppercase", MUTED)}>
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
                  const state = selected ? dayState(selected.id, day) : "free"
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={past}
                      aria-pressed={on}
                      aria-label={`${fmtDate(day)}${selected ? `, ${state === "partial" ? "partly booked" : state === "booked" ? "booked" : "available"}` : `, ${freeOn(day)} cars free`}`}
                      onClick={() => setDate(day)}
                      className={cn(
                        "relative flex aspect-square flex-col items-center justify-center rounded-2xl text-sm font-medium transition outline-none focus-visible:ring-3 focus-visible:ring-black/25 disabled:opacity-30 sm:text-base",
                        on
                          ? "bg-[#16120E] text-white shadow-[0_12px_30px_-12px_rgba(22,18,14,0.7)]"
                          : past
                            ? "text-black/35"
                            : selected
                              ? state === "booked"
                                ? "bg-rose-50 text-rose-700 hover:bg-rose-100"
                                : state === "partial"
                                  ? "bg-amber-50 text-amber-800 hover:bg-amber-100"
                                  : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                              : "bg-[#F7F4EF] hover:bg-[#EFE9E0]"
                      )}
                    >
                      {i + 1}
                      {on && data && (
                        <span className="text-[10px] font-normal opacity-75">
                          {selected ? (state === "booked" ? "booked" : state === "partial" ? "partly" : "free") : `${freeOn(day)} free`}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              <div className={cn("mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs", MUTED)}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-emerald-500" /> Available
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-amber-400" /> Partly booked
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-rose-400" /> Booked / not available
                </span>
                <span>{selected ? `Showing ${selected.name}` : "Pick a car to colour its dates"}</span>
              </div>
            </Reveal>

            <Reveal
              delay={120}
              aria-live="polite"
              className="relative flex flex-col overflow-hidden rounded-[2rem] bg-[linear-gradient(150deg,#FBF3E6_0%,#F3E1E4_55%,#E6E1F5_100%)] p-5 sm:p-8"
            >
              <Sparkle className="absolute -top-6 -right-6 size-28 animate-sparkle-float opacity-80" />
              <p className={cn("relative text-xs font-medium tracking-[0.3em] uppercase", MUTED)}>Your answer</p>
              <p className="relative mt-2 text-sm">{fmtDate(date)}</p>
              <label className="relative mt-4 flex h-12 items-center rounded-full border border-black/10 bg-white/80 pr-3 pl-4 backdrop-blur">
                <span className="sr-only">Car</span>
                <select value={carId} onChange={(e) => setCarId(e.target.value)} className="w-full bg-transparent text-sm outline-none" aria-label="Car">
                  <option value="">All cars</option>
                  {cars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.color}
                    </option>
                  ))}
                </select>
              </label>
              {selected && (
                <div className="relative mt-4 overflow-hidden rounded-2xl">
                  <CarPhoto car={selected} className="aspect-[16/8]" sizes="(min-width: 1024px) 40vw, 100vw" />
                  <span className="absolute bottom-3 left-4 text-lg font-medium text-white">{selected.name}</span>
                </div>
              )}
              <div className={cn(display.className, "relative mt-6 grid gap-2 tracking-[-0.02em]")}>{answer()}</div>
              {hasWindow && !windowOk && <p className="relative mt-2 text-sm text-rose-700">The end time must be after the start time.</p>}
              <p className={cn("relative mt-3 flex items-center gap-1.5 text-sm", MUTED)}>
                <ClockIcon className="size-4" />
                {windowOk ? `Checking ${windowText}` : "Add a time above to check an exact window"}
              </p>
              {business?.phone && (
                <div className="relative mt-auto flex flex-wrap gap-2 pt-8">
                  <a href={tel(business.phone)} className={PILL_DARK}>
                    <PhoneIcon className="size-4" />
                    Call to book
                  </a>
                  <a href={wa(business.phone)} target="_blank" rel="noreferrer" className={PILL_LIGHT}>
                    <MessageCircleIcon className="size-4" />
                    WhatsApp
                  </a>
                </div>
              )}
            </Reveal>
          </div>
        </section>

        <GoogleReviewsSection />

        <Contact business={business} bizName={bizName} />
      </main>

      <footer className="px-3 pb-6 sm:px-4">
        <div className={cn("mx-auto flex max-w-[88rem] flex-wrap items-center justify-between gap-3 px-2 pt-4 text-sm", MUTED)}>
          <span className="flex items-center gap-2">
            <Image src="/logo.png" alt="" width={28} height={28} className="size-7" />
            {bizName}
          </span>
          <span>© {today.slice(0, 4)} · Wedding cars · Ja-Ela, Sri Lanka</span>
        </div>
      </footer>
    </div>
  )
}

function Chip({
  on,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean }) {
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

// ---------- Fleet: a scattered gallery that drifts on scroll ----------

const SHAPES = ["aspect-[4/5]", "aspect-[16/11]", "aspect-square", "aspect-[3/4]", "aspect-[16/10]"]
const COLUMN_SPEED = [-60, 90, -150]

function FleetGallery({ cars, loading, onPick }: { cars: PublicCar[]; loading: boolean; onPick: (id: string) => void }) {
  const columns: { car: PublicCar; i: number }[][] = [[], [], []]
  cars.forEach((car, i) => columns[i % 3].push({ car, i }))
  const card = ({ car, i }: { car: PublicCar; i: number }) => (
    <li key={car.id}>
      <Reveal delay={(i % 3) * 90}>
        <button
          type="button"
          onClick={() => onPick(car.id)}
          className="group/photo relative block w-full overflow-hidden rounded-[1.5rem] text-left shadow-[0_24px_60px_-30px_rgba(40,30,20,0.45)] transition duration-500 hover:-translate-y-1.5"
        >
          <CarPhoto car={car} className={SHAPES[i % SHAPES.length]} sizes="(min-width: 1024px) 30vw, 50vw" />
          <span className="absolute top-3 left-4 text-xs font-medium tracking-wide text-white/90 drop-shadow">{String(i + 1).padStart(2, "0")}</span>
          <span className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-2 text-white">
            <span className="min-w-0">
              <span className="block truncate text-lg font-medium">{car.name}</span>
              <span className="block text-xs text-white/75 capitalize">
                {car.color} · {STYLE_LABEL[car.style]}
              </span>
            </span>
            <span className="grid size-9 shrink-0 translate-y-1 place-items-center rounded-full bg-white/90 text-[#16120E] opacity-0 transition group-hover/photo:translate-y-0 group-hover/photo:opacity-100">
              <ArrowUpRightIcon className="size-4" />
            </span>
          </span>
        </button>
      </Reveal>
    </li>
  )
  return (
    <section id="fleet" aria-labelledby="fleet-title" className="scroll-mt-24 overflow-hidden px-3 pt-10 pb-24 sm:px-4">
      <div className="mx-auto max-w-[88rem]">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-6 px-2">
          <Reveal>
            <p className={cn("mb-4 text-xs font-medium tracking-[0.3em] uppercase", MUTED)}>The fleet</p>
            <h2 id="fleet-title" className={cn(display.className, "text-5xl leading-[0.95] font-medium tracking-[-0.04em] sm:text-7xl")}>
              Cars worth
              <br />
              <span className="text-black/30">remembering</span>
            </h2>
          </Reveal>
          <Reveal delay={100} className={cn("max-w-xs text-sm leading-relaxed", MUTED)}>
            {cars.length ? `${cars.length} cars, ` : ""}each photographed as it arrives on the day. Tap one to check its dates.
          </Reveal>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/5] rounded-[1.5rem]" />
            ))}
          </div>
        ) : (
          <>
            {/* Phones and tablets: two plain columns. */}
            <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:hidden">{cars.map((car, i) => card({ car, i }))}</ul>
            {/* Desktop: three columns drifting at different speeds. */}
            <div className="hidden grid-cols-3 gap-6 lg:grid">
              {columns.map((col, c) => (
                <Parallax key={c} speed={COLUMN_SPEED[c]} className={cn(c === 1 && "pt-24")}>
                  <ul className="grid gap-6">{col.map(card)}</ul>
                </Parallax>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

// ---------- Contact ----------

function Contact({ business, bizName }: { business?: Business; bizName: string }) {
  const items = business
    ? [
        business.phone && { icon: PhoneIcon, label: "Call", value: business.phone, href: tel(business.phone) },
        business.phone && { icon: MessageCircleIcon, label: "WhatsApp", value: "Message us", href: wa(business.phone), external: true },
        business.email && { icon: MailIcon, label: "Email", value: business.email, href: `mailto:${business.email}` },
        business.address && { icon: MapPinIcon, label: "Visit", value: business.address, href: mapLink(business.address), external: true },
      ].filter((x): x is { icon: typeof PhoneIcon; label: string; value: string; href: string; external?: boolean } => !!x)
    : []
  return (
    <section id="contact" aria-labelledby="contact-title" className="scroll-mt-24 px-3 py-6 sm:px-4">
      <div className="relative mx-auto max-w-[88rem] overflow-hidden rounded-[2rem] border border-black/[0.06] bg-white px-6 py-16 sm:px-12 sm:py-24">
        <div aria-hidden className="pointer-events-none absolute -top-32 -right-24 size-[30rem] rounded-full bg-[radial-gradient(circle,rgba(233,206,160,0.45),rgba(240,210,214,0.3)_45%,transparent_70%)] blur-2xl" />
        <div className="relative grid gap-12 *:min-w-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end">
          <Reveal>
            <p className={cn("mb-4 text-xs font-medium tracking-[0.3em] uppercase", MUTED)}>Contact us</p>
            <h2 id="contact-title" className={cn(display.className, "text-[clamp(2.5rem,11vw,6.5rem)] leading-[0.92] font-medium tracking-[-0.045em]")}>
              Let&apos;s make it
              <br />
              <span className="text-black/30">unforgettable.</span>
            </h2>
            <p className={cn("mt-6 max-w-md text-base leading-relaxed", MUTED)}>
              Found your date? Call or message {bizName} to confirm your booking — we&apos;ll hold the car and plan the route with you.
            </p>
          </Reveal>
          <ul className="grid gap-3 *:min-w-0">
            {!business
              ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)
              : items.map((it, i) => (
                  <Reveal as="li" key={it.label} delay={i * 80}>
                    <a
                      href={it.href}
                      {...(it.external ? { target: "_blank", rel: "noreferrer" } : {})}
                      className="group flex items-center gap-4 rounded-2xl border border-black/[0.07] bg-[#F7F4EF] p-4 transition hover:-translate-y-0.5 hover:border-black/20 hover:bg-white"
                    >
                      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white shadow-sm transition group-hover:bg-[#16120E] group-hover:text-white">
                        <it.icon className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-xs tracking-[0.2em] uppercase", MUTED)}>{it.label}</span>
                        <span className="block text-base font-medium [overflow-wrap:anywhere]">{it.value}</span>
                      </span>
                      <ArrowUpRightIcon className="size-5 shrink-0 opacity-40 transition group-hover:opacity-100" />
                    </a>
                  </Reveal>
                ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
