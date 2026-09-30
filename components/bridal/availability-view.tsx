"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { CarPhoto, Swatch } from "@/components/bridal/car-art"
import { InvoiceDialog } from "@/components/bridal/invoice-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  addDays,
  fmtDate,
  MONTHS,
  pad,
  parseIso,
  rs,
  todayIso,
} from "@/lib/bridal/format"
import { carSlotsOn, describeGap, fmtMinutes, freeGaps, isActive, sortCars, useBridal } from "@/lib/bridal/store"
import type { Booking } from "@/lib/bridal/types"

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export function AvailabilityView() {
  const { ready } = useBridal()
  if (!ready) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-[440px] rounded-3xl" />
        <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <Skeleton className="h-[520px] rounded-xl" />
          <Skeleton className="h-[520px] rounded-xl" />
        </div>
      </div>
    )
  }
  return <Availability />
}

function Availability() {
  const { cars, bookings } = useBridal()
  const [selDate, setSelDate] = React.useState(todayIso)
  const [view, setView] = React.useState(() => {
    const d = parseIso(selDate)
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [filterCar, setFilterCar] = React.useState("all")
  const [invoice, setInvoice] = React.useState<Booking | null>(null)

  const sorted = sortCars(cars)
  const carFilter = cars.some((c) => c.id === filterCar) ? filterCar : "all"
  const carById = (id: string) => cars.find((c) => c.id === id)

  function goDate(s: string) {
    setSelDate(s)
    const d = parseIso(s)
    setView({ y: d.getFullYear(), m: d.getMonth() })
  }

  function shiftMonth(delta: number) {
    setView(({ y, m }) => {
      const d = new Date(y, m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  const today = todayIso()
  const tomorrow = addDays(today, 1)
  const lead = (new Date(view.y, view.m, 1).getDay() + 6) % 7
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()

  const past = selDate < today
  // Each car's hires on the selected date as time slots; a car can have
  // several hires a day as long as their times don't overlap.
  const dayRows = sorted.map((car) => {
    const slots = carSlotsOn(bookings, car.id, selDate)
    return { car, slots, gaps: freeGaps(slots) }
  })
  const free = dayRows.filter((r) => !r.slots.length).length

  return (
    <div className="grid gap-6">
    <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
      <Card>
        <CardHeader className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
            <ChevronLeftIcon />
          </Button>
          <CardTitle className="min-w-36 flex-1 text-center text-lg sm:text-left">
            {MONTHS[view.m]} {view.y}
          </CardTitle>
          <Button variant="outline" size="icon" aria-label="Next month" onClick={() => shiftMonth(1)}>
            <ChevronRightIcon />
          </Button>
          <Button variant="outline" onClick={() => goDate(today)}>
            Today
          </Button>
          <Input
            type="date"
            aria-label="Go to date"
            className="w-auto"
            value={selDate}
            onChange={(e) => e.target.value && goDate(e.target.value)}
          />
          <NativeSelect
            aria-label="Show availability for"
            value={carFilter}
            onChange={(e) => setFilterCar(e.target.value)}
          >
            <NativeSelectOption value="all">All cars</NativeSelectOption>
            {sorted.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name} · {c.color}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1.5 pb-1 text-center text-[11px] tracking-widest text-muted-foreground uppercase">
            {WEEKDAYS.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {Array.from({ length: lead }, (_, i) => (
              <div key={`lead-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const d = i + 1
              const s = `${view.y}-${pad(view.m + 1)}-${pad(d)}`
              const dayBookings = bookings.filter((b) => isActive(b) && b.date === s)
              // Hires of the filtered car that day (it may still have free time).
              const carHires = carFilter === "all" ? 0 : carSlotsOn(bookings, carFilter, s).length
              const dayCarIds = dayBookings.flatMap((b) => b.cars.map((c) => c.carId))
              return (
                <button
                  key={s}
                  type="button"
                  aria-label={fmtDate(s)}
                  aria-pressed={s === selDate}
                  onClick={() => setSelDate(s)}
                  className={cn(
                    "relative flex aspect-[1/0.92] min-w-0 flex-col justify-between rounded-lg border bg-card p-1 text-left transition-colors outline-none hover:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:p-1.5",
                    s < today && "opacity-45",
                    carFilter !== "all" && (carHires ? "border-amber-500/40 bg-amber-500/10" : "bg-muted"),
                    s === selDate && "border-2 border-primary"
                  )}
                >
                  <span
                    className={cn(
                      "text-xs font-semibold sm:text-sm",
                      s === today && "text-primary underline underline-offset-2"
                    )}
                  >
                    {d}
                  </span>
                  {s === tomorrow && dayBookings.length > 0 && (
                    <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" />
                  )}
                  {carFilter === "all" ? (
                    <>
                      <span className="flex flex-wrap gap-0.5">
                        {dayCarIds.map((id, i) => (
                          <Swatch key={`${id}-${i}`} hex={carById(id)?.hex ?? "#999999"} className="size-2" />
                        ))}
                      </span>
                      {cars.length > 0 && (
                        <span className="hidden text-[11px] text-muted-foreground sm:block">
                          {cars.length - new Set(dayCarIds).size}/{cars.length} no hires
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="hidden text-[11px] text-muted-foreground sm:block">
                      {carHires ? `${carHires} hire${carHires === 1 ? "" : "s"}` : "Free"}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            {carFilter === "all" ? (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-primary" /> Hire tomorrow
                </span>
                <span>Dots = hires (a car can have several a day)</span>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm border bg-muted" /> No hires
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm border border-amber-500/40 bg-amber-500/10" /> Has hires (check times)
                </span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription className="text-[11px] font-semibold tracking-widest uppercase">
            Selected date
          </CardDescription>
          <CardTitle className="text-lg">{fmtDate(selDate)}</CardTitle>
          {cars.length > 0 && (
            <CardAction>
              <Badge variant="secondary">
                {free} of {cars.length} with no hires
              </Badge>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {cars.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No cars yet</EmptyTitle>
                <EmptyDescription>Add your fleet to start taking bookings.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild size="sm">
                  <Link href="/dashboard/cars">Add a car</Link>
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <ItemGroup className="gap-2">
              {dayRows.map(({ car, slots, gaps }) => (
                <Item key={car.id} variant="outline" size="sm" className="items-start">
                  <ItemMedia className="w-28 overflow-hidden rounded-lg">
                    <CarPhoto car={car} sizes="112px" />
                  </ItemMedia>
                  <ItemContent className="min-w-40">
                    <ItemTitle>{car.name}</ItemTitle>
                    <ItemDescription className="flex items-center gap-1.5">
                      <Swatch hex={car.hex} /> {car.color} · {rs(car.rate)}
                    </ItemDescription>
                    {slots.length > 0 && (
                      <ul className="mt-1 grid gap-1">
                        {slots.map((x, i) => (
                          <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                            <span className="font-mono font-medium tabular-nums">
                              {fmtMinutes(x.start)} – {fmtMinutes(x.end)}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground">{x.booking.invNo}</span>
                            <span className="text-muted-foreground">{x.booking.customer}</span>
                            <span className="flex gap-1">
                              <Button size="xs" variant="outline" onClick={() => setInvoice(x.booking)}>
                                Invoice
                              </Button>
                              <Button size="xs" variant="outline" asChild>
                                <Link href={`/dashboard/bookings/${x.booking.id}/edit`}>Edit</Link>
                              </Button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {slots.length > 0 && (
                      <ItemDescription>Free: {gaps.map(describeGap).join(", ") || "none"}</ItemDescription>
                    )}
                  </ItemContent>
                  <ItemActions className="ml-auto self-center">
                    <Badge variant={slots.length ? "outline" : "secondary"}>
                      {slots.length ? `${slots.length} hire${slots.length === 1 ? "" : "s"}` : "Free all day"}
                    </Badge>
                    {!past && gaps.length > 0 && (
                      <Button size="sm" asChild>
                        <Link href={`/dashboard/bookings/new?date=${selDate}&car=${encodeURIComponent(car.id)}`}>Book</Link>
                      </Button>
                    )}
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </CardContent>
      </Card>

      <InvoiceDialog booking={invoice} onOpenChange={(open) => !open && setInvoice(null)} />
    </div>
    </div>
  )
}
