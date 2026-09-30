"use client"

import { BellIcon } from "lucide-react"

import { Swatch } from "@/components/bridal/car-art"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { addDays, fmtTime, todayIso } from "@/lib/bridal/format"
import { isActive, useBridal } from "@/lib/bridal/store"

// Hires happening today or tomorrow, so nothing sneaks up on the driver.
export function ReminderBanner() {
  const { ready, bookings, cars } = useBridal()
  if (!ready) return null

  const today = todayIso()
  const tomorrow = addDays(today, 1)
  // One line per car: each car in an order can have its own pick-up.
  const upcoming = bookings
    .filter((b) => isActive(b) && (b.date === today || b.date === tomorrow))
    .flatMap((b) => b.cars.map((bc, i) => ({ b, bc, key: `${b.id}-${i}` })))
    .sort((x, y) => (x.b.date + x.bc.pickupTime).localeCompare(y.b.date + y.bc.pickupTime))

  if (!upcoming.length) return null

  return (
    <Alert>
      <BellIcon />
      <AlertTitle>Coming up</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 grid gap-1.5">
          {upcoming.map(({ b, bc, key }) => (
            <li key={key} className="flex flex-wrap items-center gap-2 text-foreground">
              <Badge variant={b.date === today ? "default" : "outline"}>
                {b.date === today ? "Today" : "Tomorrow"}
              </Badge>
              <Swatch hex={cars.find((c) => c.id === bc.carId)?.hex ?? "#999999"} />
              <span className="font-medium">{bc.carName}</span>
              <span className="text-muted-foreground">
                · {b.customer} · {fmtTime(bc.pickupTime)} · {bc.pickupLoc}
              </span>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}
