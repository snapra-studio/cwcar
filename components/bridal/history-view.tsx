"use client"

import * as React from "react"
import { CalendarIcon, FileSpreadsheetIcon } from "lucide-react"
import { toast } from "sonner"

import { BookingRow } from "@/components/bridal/booking-row"
import { InvoiceDialog } from "@/components/bridal/invoice-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ItemGroup } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { fmtDate, monthRange, todayIso } from "@/lib/bridal/format"
import { isActive, startTime, useBridal } from "@/lib/bridal/store"
import type { Booking } from "@/lib/bridal/types"

export function HistoryView() {
  const { ready } = useBridal()
  if (!ready) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    )
  }
  return <History />
}

function NoBookings({ children }: { children: React.ReactNode }) {
  return (
    <Empty className="py-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CalendarIcon />
        </EmptyMedia>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function ExportCard() {
  const { bookings, ledger } = useBridal()
  const [[from, to], setRange] = React.useState(() => monthRange(0))
  const [busy, setBusy] = React.useState(false)

  const valid = !!from && !!to && from <= to
  const inRange = valid ? bookings.filter((b) => b.date >= from && b.date <= to) : []
  const presets = [
    { label: "This month", range: monthRange(0) },
    { label: "Last month", range: monthRange(-1) },
    { label: "This year", range: [`${todayIso().slice(0, 4)}-01-01`, `${todayIso().slice(0, 4)}-12-31`] as const },
  ]

  async function download() {
    setBusy(true)
    try {
      const { downloadBookingsExcel } = await import("@/lib/bridal/export-excel")
      const n = await downloadBookingsExcel(bookings, ledger, from, to)
      toast.success(`Excel downloaded · ${n} booking${n === 1 ? "" : "s"}`)
    } catch {
      toast.error("Could not create the Excel file. Reload the page and try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Download Excel</CardTitle>
        <CardDescription>Every booking with a hire date in the period you pick.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field className="w-auto">
            <FieldLabel htmlFor="exportFrom">From</FieldLabel>
            <Input id="exportFrom" type="date" value={from} onChange={(e) => setRange([e.target.value, to])} />
          </Field>
          <Field className="w-auto">
            <FieldLabel htmlFor="exportTo">To</FieldLabel>
            <Input id="exportTo" type="date" value={to} onChange={(e) => setRange([from, e.target.value])} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <Button key={p.label} variant="outline" size="sm" onClick={() => setRange(p.range)}>
                {p.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={download} disabled={!valid || !inRange.length || busy} className="rounded-full px-5">
            <FileSpreadsheetIcon data-icon="inline-start" />
            {busy ? "Preparing…" : "Download Excel"}
          </Button>
          <span className="text-sm text-muted-foreground">
            {!valid
              ? "Pick a start date on or before the end date."
              : inRange.length
                ? `${inRange.length} booking${inRange.length === 1 ? "" : "s"} · ${fmtDate(from)} – ${fmtDate(to)}`
                : "No bookings in this period."}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function History() {
  const { cars, bookings } = useBridal()
  const [day, setDay] = React.useState(todayIso)
  const [invoice, setInvoice] = React.useState<Booking | null>(null)

  const today = todayIso()
  const carById = (id: string) => cars.find((c) => c.id === id)
  const onDay = bookings
    .filter((b) => b.date === day)
    .sort((a, b) => startTime(a).localeCompare(startTime(b)))
  const upcoming = bookings
    .filter((b) => isActive(b) && b.date >= today)
    .sort((a, b) => (a.date + startTime(a)).localeCompare(b.date + startTime(b)))
    .slice(0, 15)
  // Hires whose date has passed (not cancelled), most recent first.
  const completed = bookings
    .filter((b) => isActive(b) && b.date < today)
    .sort((a, b) => (b.date + startTime(b)).localeCompare(a.date + startTime(a)))
    .slice(0, 15)

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{fmtDate(day)}</CardTitle>
          <CardAction className="flex gap-2">
            <Input
              type="date"
              aria-label="Day"
              className="w-auto"
              value={day}
              onChange={(e) => e.target.value && setDay(e.target.value)}
            />
            <Button variant="outline" onClick={() => setDay(today)}>
              Today
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {onDay.length ? (
            <ItemGroup className="gap-2">
              {onDay.map((b) => (
                <BookingRow key={b.id} booking={b} cars={b.cars.map((c) => carById(c.carId))} onInvoice={setInvoice} />
              ))}
            </ItemGroup>
          ) : (
            <NoBookings>No hires on this day.</NoBookings>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Upcoming</CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length ? (
            <ItemGroup className="gap-2">
              {upcoming.map((b) => (
                <BookingRow key={b.id} booking={b} cars={b.cars.map((c) => carById(c.carId))} onInvoice={setInvoice} />
              ))}
            </ItemGroup>
          ) : (
            <NoBookings>No upcoming hires. Add one from New booking.</NoBookings>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Completed</CardTitle>
          <CardDescription>The latest hires whose date has passed. Use Download Excel for older ones.</CardDescription>
        </CardHeader>
        <CardContent>
          {completed.length ? (
            <ItemGroup className="gap-2">
              {completed.map((b) => (
                <BookingRow key={b.id} booking={b} cars={b.cars.map((c) => carById(c.carId))} onInvoice={setInvoice} />
              ))}
            </ItemGroup>
          ) : (
            <NoBookings>No completed hires yet.</NoBookings>
          )}
        </CardContent>
      </Card>

      <ExportCard />

      <InvoiceDialog booking={invoice} onOpenChange={(open) => !open && setInvoice(null)} />
    </div>
  )
}
