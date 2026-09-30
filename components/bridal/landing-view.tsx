"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowRightIcon, CalendarClockIcon, ImagePlusIcon, SparklesIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { NAV_ITEMS } from "@/components/top-nav"
import { PhotoPicker } from "@/components/bridal/fleet-view"
import { InvoiceDialog } from "@/components/bridal/invoice-dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { addDays, fmtDate, fmtTime, rs, todayIso } from "@/lib/bridal/format"
import { bookingFor, carNames, isActive, setCoverImage, sortCars, startTime, useBridal } from "@/lib/bridal/store"
import type { Booking } from "@/lib/bridal/types"
import { cn } from "@/lib/utils"

// Frosted tile that sits on the background photo.
const GLASS =
  "rounded-2xl border border-white/20 bg-white/10 shadow-lg shadow-black/20 backdrop-blur-md supports-[not(backdrop-filter:blur(0))]:bg-black/45"

export function LandingView() {
  const { ready } = useBridal()
  if (!ready) return <Skeleton className="min-h-svh rounded-none" />
  return <Landing />
}

async function saveCover(image: string | undefined) {
  try {
    await setCoverImage(image)
    toast.success(image ? "Background photo updated" : "Background photo removed")
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Could not save the photo. Try a smaller one.")
  }
}

function Landing() {
  const { cars, bookings, settings } = useBridal()
  const [invoice, setInvoice] = React.useState<Booking | null>(null)
  const today = todayIso()
  const month = today.slice(0, 7)

  // Background: the uploaded photo, else a fleet photo, else the built-in
  // fairy-light scene.
  const fleetPhoto = sortCars(cars).find((c) => c.image)?.image
  const background = settings.coverImage ?? fleetPhoto ?? "/landing-bg.svg"

  const active = bookings.filter(isActive)
  const monthBookings = active.filter((b) => b.date.startsWith(month))
  const upcoming = active
    .filter((b) => b.date >= today)
    .sort((a, b) => (a.date + startTime(a)).localeCompare(b.date + startTime(b)))

  const stats = [
    { label: "Free today", value: `${cars.filter((c) => !bookingFor(bookings, c.id, today)).length}/${cars.length}` },
    { label: "Hires this month", value: monthBookings.length },
    { label: "Upcoming", value: upcoming.length },
    { label: "Booked this month", value: rs(monthBookings.reduce((sum, b) => sum + b.total, 0)) },
  ]

  return (
    <section className="relative isolate flex min-h-svh w-full flex-col overflow-hidden text-white">
      <Image
        src={background}
        alt=""
        fill
        priority
        unoptimized
        sizes="100vw"
        className="-z-20 animate-kenburns object-cover"
      />
      {/* Darken towards the tiles so white text stays readable on any photo. */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/40 to-black/25" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/55 via-transparent to-transparent" />

      {/* Top padding clears the see-through navigation bar. */}
      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-5 px-4 pt-24 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8 lg:pt-28 lg:pb-10">
        <div className="flex min-w-0 flex-col gap-6">
          {/* Brand */}
          <div className="grid max-w-xl animate-in justify-items-start gap-4 duration-700 fade-in slide-in-from-bottom-4">
            <span className={cn(GLASS, "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium")}>
              <SparklesIcon className="size-3.5" />
              Wedding &amp; homecoming cars
            </span>
            <h2 className="text-4xl leading-[1.05] font-bold tracking-tight text-balance drop-shadow-lg md:text-5xl xl:text-6xl">
              {settings.bizName}
            </h2>
            <p className="max-w-md text-base text-white/85 drop-shadow md:text-lg">
              Decorated, chauffeured and on time — for the biggest day of the year.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-11 rounded-full px-6 text-sm shadow-lg shadow-black/30">
                <Link href="/dashboard/bookings/new">
                  New booking
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-11 rounded-full border-white/40 bg-white/10 px-6 text-sm text-white backdrop-blur-md hover:bg-white/20 hover:text-white"
              >
                <Link href="/dashboard/availability">Check availability</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="ghost"
                className="h-11 rounded-full px-4 text-sm text-white/85 hover:bg-white/10 hover:text-white"
              >
                {/* The page customers use; share this link with them. */}
                <Link href="/availability" target="_blank">
                  Public availability page ↗
                </Link>
              </Button>
            </div>
          </div>

          <div className="mt-auto grid gap-4">
            {/* Stats */}
            <dl className="grid animate-in grid-cols-2 gap-3 delay-150 duration-700 fade-in fill-mode-both slide-in-from-bottom-4 md:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className={cn(GLASS, "grid gap-1 p-4")}>
                  <dt className="text-[11px] tracking-widest text-white/70 uppercase">{s.label}</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{s.value}</dd>
                </div>
              ))}
            </dl>

            {/* Sections */}
            <nav
              aria-label="Sections"
              className="grid animate-in grid-cols-2 gap-3 delay-300 duration-700 fade-in fill-mode-both slide-in-from-bottom-4 sm:grid-cols-3 xl:grid-cols-5"
            >
              {NAV_ITEMS.filter((i) => i.url !== "/dashboard").map((item) => (
                <Link
                  key={item.url}
                  href={item.url}
                  className={cn(
                    GLASS,
                    "group grid content-start gap-2 p-4 transition outline-none hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/20 focus-visible:ring-3 focus-visible:ring-white/60"
                  )}
                >
                  <span className="flex items-center justify-between">
                    <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-black/20">
                      <item.icon className="size-5" />
                    </span>
                    <ArrowRightIcon className="size-4 text-white/60 transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
                  </span>
                  <span className="font-semibold">{item.title}</span>
                  <span className="text-xs leading-snug text-white/75">{item.description}</span>
                </Link>
              ))}
            </nav>
          </div>
        </div>

        <UpcomingPanel upcoming={upcoming} onInvoice={setInvoice} />
      </div>

      {/* Background photo controls */}
      <div className="absolute right-4 bottom-4 flex gap-1.5 lg:right-8 lg:bottom-8">
        <PhotoPicker
          size="sm"
          variant="outline"
          maxWidth={1920}
          className="rounded-full border-white/30 bg-black/35 text-white backdrop-blur-md hover:bg-black/50 hover:text-white"
          onPick={saveCover}
        >
          <ImagePlusIcon data-icon="inline-start" />
          {settings.coverImage ? "Change background" : "Add background photo"}
        </PhotoPicker>
        {settings.coverImage && (
          <Button
            size="icon-sm"
            variant="outline"
            className="rounded-full border-white/30 bg-black/35 text-white backdrop-blur-md hover:bg-black/50 hover:text-white"
            aria-label="Remove background photo"
            onClick={() => saveCover(undefined)}
          >
            <Trash2Icon />
          </Button>
        )}
      </div>

      <InvoiceDialog booking={invoice} onOpenChange={(open) => !open && setInvoice(null)} />
    </section>
  )
}

function UpcomingPanel({ upcoming, onInvoice }: { upcoming: Booking[]; onInvoice: (b: Booking) => void }) {
  const today = todayIso()
  const tomorrow = addDays(today, 1)
  const shown = upcoming.slice(0, 6)

  return (
    <aside
      className={cn(
        GLASS,
        "flex animate-in flex-col gap-3 self-start p-4 delay-200 duration-700 fade-in fill-mode-both slide-in-from-right-4"
      )}
    >
      <h3 className="flex items-center gap-2 text-lg font-semibold">
        <CalendarClockIcon className="size-5" />
        Upcoming hires
      </h3>
      {shown.length === 0 ? (
        <div className="grid justify-items-start gap-3 py-2 text-sm text-white/80">
          No upcoming hires yet.
          <Button asChild size="sm" className="rounded-full">
            <Link href="/dashboard/bookings/new">New booking</Link>
          </Button>
        </div>
      ) : (
        <ul className="grid gap-2">
          {shown.map((b) => {
            const first = b.cars.slice().sort((x, y) => x.pickupTime.localeCompare(y.pickupTime))[0]
            const isToday = b.date === today
            const when = isToday ? "Today" : b.date === tomorrow ? "Tomorrow" : fmtDate(b.date)
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => onInvoice(b)}
                  className="grid w-full gap-0.5 rounded-xl border border-white/15 bg-black/20 p-3 text-left transition outline-none hover:border-white/40 hover:bg-black/30 focus-visible:ring-3 focus-visible:ring-white/60"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        isToday ? "bg-primary text-primary-foreground" : "bg-white/15 text-white"
                      )}
                    >
                      {when}
                    </span>
                    <span className="font-mono text-[11px] text-white/60">{b.invNo}</span>
                  </span>
                  <span className="mt-1 font-medium">{b.customer}</span>
                  <span className="text-sm text-white/75">{carNames(b)}</span>
                  {first && (
                    <span className="text-sm text-white/75">
                      {fmtTime(first.pickupTime)} · {first.pickupLoc}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {upcoming.length > 0 && (
        <Button
          asChild
          variant="outline"
          className="w-full rounded-full border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
        >
          <Link href="/dashboard/history">
            {upcoming.length > shown.length ? `See all ${upcoming.length} upcoming` : "Open history"}
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      )}
    </aside>
  )
}
