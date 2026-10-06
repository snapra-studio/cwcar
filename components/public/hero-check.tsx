"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowUpRightIcon, CheckCircle2Icon, ChevronDownIcon, MessageCircleIcon, PhoneIcon, SearchIcon, XCircleIcon } from "lucide-react"

import { serif } from "@/components/public/fonts"
import { STYLE_LABEL, carPath, tel, wa, type PublicCar } from "@/components/public/site-parts"
import { fmtDate } from "@/lib/bridal/format"
import type { CarStyle } from "@/lib/bridal/types"
import { cn } from "@/lib/utils"

// The quick availability form on the opening film: a dark frosted panel
// with "car type → car → date (→ time)" and one button. It asks the same
// public check as the calendar below (/api/availability: our own fleet only,
// answered just "available" or "not") and shows the answer in the panel.

type Answer = { carId: string; date: string; window: string; available: boolean } | null

const FIELD =
  "h-12 w-full appearance-none rounded-lg border border-white/15 bg-white/[0.08] pr-9 pl-3.5 text-sm text-white outline-none transition focus:border-[#E4C48C] focus:bg-white/[0.12] [color-scheme:dark] disabled:opacity-50"
const LABEL = "mb-1.5 block text-[11px] font-medium tracking-[0.12em] text-white/60 uppercase"

const fmtT = (t: string) => {
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
}

function Select({ id, label, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { id: string; label: string }) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className="relative">
        <select id={id} className={cn(FIELD, "[&>option]:bg-[#221a13]")} {...props}>
          {children}
        </select>
        <ChevronDownIcon aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-white/60" />
      </div>
    </div>
  )
}

// `carId`/`onCarChange`: the chosen car is shared with the page, so "Check
// dates" on the fleet carousel or a car card fills it in here.
export function HeroCheck({
  cars,
  today,
  phone,
  carId,
  onCarChange,
}: {
  cars: PublicCar[]
  today: string
  phone?: string
  carId: string
  onCarChange: (id: string) => void
}) {
  const [type, setType] = React.useState<"" | CarStyle>("")
  const setCarId = onCarChange
  const [date, setDate] = React.useState("")
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [answer, setAnswer] = React.useState<Answer>(null)

  const types = [...new Set(cars.map((c) => c.style))]
  const choices = cars.filter((c) => !type || c.style === type)
  const car = cars.find((c) => c.id === carId)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setAnswer(null)
    if (!carId) return setError("Choose a car.")
    if (!date) return setError("Choose your date.")
    if (!!from !== !!to || (from && to <= from)) return setError("Add both times, with the end after the start — or leave them empty.")
    setError("")
    setBusy(true)
    try {
      const params = new URLSearchParams({ car: carId, date, ...(from ? { from, to } : {}) })
      const r = await fetch(`/api/availability?${params}`)
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body.error ?? "Couldn't check right now. Try again.")
      setAnswer({ carId, date, window: from ? `${fmtT(from)} – ${fmtT(to)}` : "", available: !!body.available })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check right now. Try again.")
    } finally {
      setBusy(false)
    }
  }

  // A changed choice clears the previous answer.
  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setAnswer(null)
    setError("")
  }

  return (
    <form
      id="check"
      onSubmit={submit}
      noValidate
      aria-labelledby="hero-check-title"
      className="w-full max-w-md animate-in rounded-2xl border border-white/15 bg-[#140e09]/70 p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] backdrop-blur-xl delay-300 duration-1000 fade-in fill-mode-both slide-in-from-bottom-4 sm:p-6"
    >
      <h2 id="hero-check-title" className={cn(serif.className, "mb-5 text-2xl leading-snug font-normal text-white sm:text-[1.7rem]")}>
        Check your wedding car&apos;s <span className="text-[#E4C48C] italic">availability</span>
      </h2>

      <div className="grid gap-3">
        <Select
          id="hc-type"
          label="Car type"
          value={type}
          onChange={(e) => {
            change(setType)(e.target.value as "" | CarStyle)
            const next = cars.find((c) => c.id === carId)
            if (next && e.target.value && next.style !== e.target.value) setCarId("")
          }}
        >
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {STYLE_LABEL[t]}
            </option>
          ))}
        </Select>

        <Select id="hc-car" label="Car" value={carId} onChange={(e) => change(setCarId)(e.target.value)} required>
          <option value="">Choose a car…</option>
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.color}
            </option>
          ))}
        </Select>

        <div>
          <label htmlFor="hc-date" className={LABEL}>
            Wedding date
          </label>
          <input id="hc-date" type="date" min={today} value={date} onChange={(e) => change(setDate)(e.target.value)} className={cn(FIELD, "pr-3")} required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="hc-from" className={LABEL}>
              From <span className="normal-case">(optional)</span>
            </label>
            <input id="hc-from" type="time" value={from} onChange={(e) => change(setFrom)(e.target.value)} className={cn(FIELD, "pr-3")} />
          </div>
          <div>
            <label htmlFor="hc-to" className={LABEL}>
              To <span className="normal-case">(optional)</span>
            </label>
            <input id="hc-to" type="time" value={to} onChange={(e) => change(setTo)(e.target.value)} className={cn(FIELD, "pr-3")} />
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#E4C48C] text-sm font-semibold tracking-[0.12em] text-[#2A1D10] uppercase shadow-[0_10px_30px_-10px_rgba(228,196,140,0.7)] transition hover:bg-[#EDD3A4] disabled:opacity-70"
        >
          <SearchIcon className="size-4" aria-hidden />
          {busy ? "Checking…" : "Check availability"}
        </button>
      </div>

      <div aria-live="polite">
        {answer && car && answer.carId === car.id && (
          <div
            className={cn(
              "mt-4 grid gap-3 rounded-xl border p-4",
              answer.available ? "border-emerald-400/40 bg-emerald-400/10" : "border-rose-400/40 bg-rose-400/10"
            )}
          >
            <p className={cn("flex items-center gap-2 text-xl font-medium", answer.available ? "text-emerald-300" : "text-rose-300")}>
              {answer.available ? <CheckCircle2Icon className="size-6" aria-hidden /> : <XCircleIcon className="size-6" aria-hidden />}
              {answer.available ? "Available" : "Not available"}
            </p>
            <p className="text-sm text-white/75">
              {car.color} {car.name} · {fmtDate(answer.date)}
              {answer.window && ` · ${answer.window}`}
            </p>
            {!answer.available && <p className="text-sm text-white/65">Try another date or car — or call us, we may still be able to help.</p>}
            <div className="flex flex-wrap gap-2">
              {phone && (
                <a href={tel(phone)} className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-[#16120E] hover:bg-[#F3E7D6]">
                  <PhoneIcon className="size-4" aria-hidden />
                  {answer.available ? "Call to book" : "Call us"}
                </a>
              )}
              {phone && (
                <a
                  href={wa(phone)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/30 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
                >
                  <MessageCircleIcon className="size-4" aria-hidden />
                  WhatsApp
                </a>
              )}
              <Link href={carPath(car)} className="inline-flex items-center gap-1.5 rounded-full border border-white/30 px-4 py-2 text-sm font-medium text-white hover:bg-white/10">
                See this car
                <ArrowUpRightIcon className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
        )}
      </div>
    </form>
  )
}
