"use client"

import * as React from "react"
import { CheckCircle2Icon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, MessageCircleIcon, PhoneIcon, XCircleIcon } from "lucide-react"

import { CarPhoto } from "@/components/bridal/car-art"
import { display } from "@/components/public/fonts"
import { Sparkle } from "@/components/public/motion"
import { MUTED, PILL_DARK, PILL_LIGHT, carAlt, tel, wa, type PublicCar } from "@/components/public/site-parts"
import { MONTHS, fmtDate, pad, parseIso } from "@/lib/bridal/format"
import { cn } from "@/lib/utils"

// The customer's availability check: choose a car, then a date (and, if they
// like, a time). The answer is only "Available" or "Not available" for that
// car on that date — it comes from /api/availability, which never shares
// other hires, times or cars. The month calendar is a plain date picker.

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const toMin = (t: string) => (/^\d{2}:\d{2}$/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : NaN)
const fmtT = (t: string) => {
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
}

type Answer = { state: "idle" } | { state: "checking" } | { state: "done"; available: boolean } | { state: "error"; message: string }

export function AvailabilityCheck({
  cars,
  today,
  carId,
  onCarChange,
  phone,
  headingId,
  heading,
}: {
  cars: PublicCar[]
  today: string
  // The chosen car; with no onCarChange the car is fixed (a car's own page).
  carId: string
  onCarChange?: (id: string) => void
  phone?: string
  headingId: string
  heading: React.ReactNode
}) {
  const [date, setDate] = React.useState("")
  const [view, setView] = React.useState(() => {
    const d = parseIso(today)
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [fromTime, setFromTime] = React.useState("")
  const [toTime, setToTime] = React.useState("")
  const [answer, setAnswer] = React.useState<Answer>({ state: "idle" })

  const car = cars.find((c) => c.id === carId)
  const hasWindow = !!fromTime || !!toTime
  const windowOk = !hasWindow || (!Number.isNaN(toMin(fromTime)) && !Number.isNaN(toMin(toTime)) && toMin(toTime) > toMin(fromTime))
  const windowText = hasWindow && windowOk ? `${fmtT(fromTime)} – ${fmtT(toTime)}` : ""

  // Ask the server whenever the car, date or time changes.
  React.useEffect(() => {
    if (!carId || !date || !windowOk) return
    const ctrl = new AbortController()
    const params = new URLSearchParams({ car: carId, date })
    if (hasWindow) {
      params.set("from", fromTime)
      params.set("to", toTime)
    }
    // Show "Checking…" straight away (after this render), then the answer.
    const t = setTimeout(() => setAnswer({ state: "checking" }), 0)
    fetch(`/api/availability?${params}`, { signal: ctrl.signal })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body.error ?? "Couldn't check right now.")
        setAnswer({ state: "done", available: !!body.available })
      })
      .catch((e) => {
        if (e.name !== "AbortError") setAnswer({ state: "error", message: e.message || "Couldn't check right now. Try again." })
      })
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [carId, date, fromTime, toTime, hasWindow, windowOk])

  const first = new Date(view.y, view.m, 1)
  const lead = (first.getDay() + 6) % 7
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const move = (d: number) => setView((v) => ({ y: v.m + d < 0 ? v.y - 1 : v.m + d > 11 ? v.y + 1 : v.y, m: (v.m + d + 12) % 12 }))
  const t0 = parseIso(today)
  const atStart = view.y === t0.getFullYear() && view.m === t0.getMonth()
  const ready = !!car
  const shown: Answer = !carId || !date || !windowOk ? { state: "idle" } : answer

  return (
    <div className="mx-auto grid max-w-[88rem] gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="rounded-[2rem] border border-black/[0.06] bg-white p-5 sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id={headingId} className={cn("text-xs font-medium tracking-[0.3em] uppercase", MUTED)}>
              {heading}
            </h2>
            <p className={cn(display.className, "mt-1 text-3xl font-medium tracking-[-0.03em] sm:text-4xl")}>
              {MONTHS[view.m]} <span className="text-black/30">{view.y}</span>
            </p>
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
        {!ready && (
          <p className="mb-4 rounded-xl border border-dashed border-black/15 p-3 text-sm">
            <strong>Step 1:</strong> choose a car{onCarChange ? " (on the right or from the list above)" : ""}, then pick your date here.
          </p>
        )}
        <div className={cn("grid grid-cols-7 gap-1.5 pb-2 text-center text-[11px] tracking-widest uppercase", MUTED)} aria-hidden>
          {WEEKDAYS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className={cn("grid grid-cols-7 gap-1.5 sm:gap-2", !ready && "opacity-40")}>
          {Array.from({ length: lead }, (_, i) => (
            <div key={`lead-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = `${view.y}-${pad(view.m + 1)}-${pad(i + 1)}`
            const past = day < today
            const on = day === date
            return (
              <button
                key={day}
                type="button"
                disabled={past || !ready}
                aria-pressed={on}
                aria-label={fmtDate(day)}
                onClick={() => setDate(day)}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-2xl text-sm font-medium transition outline-none focus-visible:ring-3 focus-visible:ring-black/25 disabled:cursor-not-allowed sm:text-base",
                  on ? "bg-[#16120E] text-white shadow-[0_12px_30px_-12px_rgba(22,18,14,0.7)]" : past ? "text-black/30" : "bg-[#F7F4EF] hover:bg-[#EFE9E0]"
                )}
              >
                {i + 1}
              </button>
            )
          })}
        </div>
      </div>

      <div aria-live="polite" className="relative flex flex-col overflow-hidden rounded-[2rem] bg-[linear-gradient(150deg,#FBF3E6_0%,#F3E1E4_55%,#E6E1F5_100%)] p-5 sm:p-8">
        <Sparkle className="absolute -top-6 -right-6 size-28 animate-sparkle-float opacity-80" />
        <p className={cn("relative text-xs font-medium tracking-[0.3em] uppercase", MUTED)}>Your answer</p>
        {onCarChange && (
          <label className="relative mt-4 grid gap-1">
            <span className={cn("px-1 text-xs", MUTED)}>Car</span>
            <span className="flex h-12 items-center rounded-full border border-black/10 bg-white/80 pr-3 pl-4 backdrop-blur">
              <select value={carId} onChange={(e) => onCarChange(e.target.value)} className="w-full bg-transparent text-sm outline-none">
                <option value="">Choose a car…</option>
                {cars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.color}
                  </option>
                ))}
              </select>
            </span>
          </label>
        )}
        {car && (
          <div className="relative mt-4 overflow-hidden rounded-2xl">
            <CarPhoto car={car} alt={carAlt(car)} className="aspect-[16/8]" sizes="(min-width: 1024px) 40vw, 100vw" />
            <span className="absolute bottom-3 left-4 text-lg font-medium text-white">{car.name}</span>
          </div>
        )}
        <div className="relative mt-4 flex flex-wrap items-end gap-2 text-sm">
          <label className="grid gap-1">
            <span className={cn("px-1 text-xs", MUTED)}>From (optional)</span>
            <input
              type="time"
              value={fromTime}
              onChange={(e) => setFromTime(e.target.value)}
              className="h-11 rounded-full border border-black/10 bg-white/90 px-4 outline-none focus:border-black/30"
            />
          </label>
          <label className="grid gap-1">
            <span className={cn("px-1 text-xs", MUTED)}>To (optional)</span>
            <input
              type="time"
              value={toTime}
              onChange={(e) => setToTime(e.target.value)}
              className="h-11 rounded-full border border-black/10 bg-white/90 px-4 outline-none focus:border-black/30"
            />
          </label>
          {hasWindow && (
            <button
              type="button"
              onClick={() => {
                setFromTime("")
                setToTime("")
              }}
              className="h-11 rounded-full px-3 font-medium underline-offset-4 hover:underline"
            >
              Clear time
            </button>
          )}
        </div>
        {!windowOk && <p className="relative mt-2 text-sm text-rose-700">Choose both times, with the end after the start.</p>}

        <div className={cn(display.className, "relative mt-6 grid gap-2 tracking-[-0.02em]")}>
          {!car ? (
            <p className="text-2xl font-medium">Choose a car to begin.</p>
          ) : !date ? (
            <p className="text-2xl font-medium">Now pick your date on the calendar.</p>
          ) : shown.state === "checking" || shown.state === "idle" ? (
            <p className="text-2xl font-medium opacity-60">{windowOk ? "Checking…" : "—"}</p>
          ) : shown.state === "error" ? (
            <p className="text-lg font-medium text-rose-700">{shown.message}</p>
          ) : shown.available ? (
            <p className="flex items-center gap-2 text-3xl font-medium text-emerald-700">
              <CheckCircle2Icon className="size-8 shrink-0" aria-hidden />
              Available
            </p>
          ) : (
            <p className="flex items-center gap-2 text-3xl font-medium text-rose-700">
              <XCircleIcon className="size-8 shrink-0" aria-hidden />
              Not available
            </p>
          )}
          {car && date && (
            <p className={cn("font-sans text-sm", MUTED)}>
              {car.name} · {fmtDate(date)}
              {windowText && ` · ${windowText}`}
            </p>
          )}
          {shown.state === "done" && !shown.available && (
            <p className={cn("font-sans text-sm", MUTED)}>Try another date{onCarChange ? " or another car" : ""}, or call us — we may still be able to help.</p>
          )}
        </div>
        <p className={cn("relative mt-3 flex items-center gap-1.5 text-sm", MUTED)}>
          <ClockIcon className="size-4" aria-hidden />
          {windowText ? `Checking ${windowText}` : "Add a time to check an exact pick-up window"}
        </p>
        {phone && (
          <div className="relative mt-auto flex flex-wrap gap-2 pt-8">
            <a href={tel(phone)} className={PILL_DARK}>
              <PhoneIcon className="size-4" aria-hidden />
              Call to book
            </a>
            <a href={wa(phone)} target="_blank" rel="noreferrer" className={PILL_LIGHT}>
              <MessageCircleIcon className="size-4" aria-hidden />
              WhatsApp
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
