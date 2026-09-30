import Link from "next/link"
import { ChevronRightIcon, ClockIcon, FlagIcon, MapPinIcon, NavigationIcon } from "lucide-react"

import { CarPhoto } from "@/components/bridal/car-art"
import { Badge } from "@/components/ui/badge"
import { fmtDate, fmtTime } from "@/lib/bridal/format"
import type { HireStatus } from "@/lib/bridal/logic"
import type { BookedCar, Car } from "@/lib/bridal/types"
import { cn } from "@/lib/utils"
import type { DriverHire } from "@/lib/server/repo"

export type CarInfo = Pick<Car, "name" | "hex" | "style" | "image" | "plate">

const STATUS: Record<HireStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  today: { label: "Today", variant: "default" },
  upcoming: { label: "Upcoming", variant: "secondary" },
  completed: { label: "Completed", variant: "outline" },
  cancelled: { label: "Cancelled", variant: "destructive" },
}

export function StatusBadge({ status }: { status: HireStatus }) {
  const s = STATUS[status]
  return <Badge variant={s.variant}>{s.label}</Badge>
}

// Pickup ↓ Stop 1 ↓ … ↓ Drop-off, large and easy to read on a phone.
export function RouteList({ car, big = false }: { car: BookedCar; big?: boolean }) {
  const points = [
    { kind: "pickup" as const, label: "Pickup", time: car.pickupTime, loc: car.pickupLoc },
    ...car.stops.map((s, i) => ({ kind: "stop" as const, label: `Stop ${i + 1}`, time: s.time, loc: s.loc })),
    { kind: "drop" as const, label: "Drop-off", time: car.dropTime, loc: car.dropLoc },
  ]
  const Icon = { pickup: NavigationIcon, stop: MapPinIcon, drop: FlagIcon }
  return (
    <ol className="grid">
      {points.map((p, i) => {
        const I = Icon[p.kind]
        const last = i === points.length - 1
        return (
          <li key={i} className="grid grid-cols-[2rem_1fr] gap-x-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full",
                  p.kind === "stop" ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"
                )}
              >
                <I className="size-4" />
              </span>
              {!last && <span className="w-0.5 flex-1 bg-primary/30" aria-hidden />}
            </div>
            <div className={cn("min-w-0", !last && "pb-4")}>
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {p.label}
                {p.time && <span className="text-foreground normal-case tracking-normal">{fmtTime(p.time)}</span>}
              </div>
              <div className={cn("font-medium break-words", big ? "text-lg" : "text-base")}>{p.loc || "—"}</div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// One assigned hire on the driver dashboard. Links to the full details.
export function HireCard({
  hire,
  status,
  cars,
}: {
  hire: DriverHire
  status: HireStatus
  cars: Record<string, CarInfo>
}) {
  return (
    <Link
      href={`/driver/hires/${encodeURIComponent(hire.id)}`}
      className={cn(
        "grid gap-4 rounded-2xl border bg-card p-4 shadow-sm transition-colors outline-none hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50",
        status === "cancelled" && "opacity-60"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={status} />
          <span className="font-mono text-xs text-muted-foreground">{hire.invNo}</span>
        </div>
        <span className="text-sm text-muted-foreground">{fmtDate(hire.date)}</span>
      </div>

      {hire.myCars.map((c, i) => {
        const info = cars[c.carId]
        return (
          <div key={i} className="grid gap-4">
            <div className="flex items-center gap-3">
              <div className="w-28 shrink-0 overflow-hidden rounded-xl">
                <CarPhoto car={info ?? { name: c.carName, hex: "#999999", style: "sedan" }} sizes="112px" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-2xl font-bold tabular-nums">
                  <ClockIcon className="size-5 text-primary" />
                  {fmtTime(c.pickupTime)}
                </div>
                <div className="font-semibold">{c.carName}</div>
                {info?.plate && (
                  <div className="mt-0.5 inline-block rounded-md border bg-background px-1.5 py-0.5 font-mono text-xs">
                    {info.plate}
                  </div>
                )}
              </div>
            </div>
            <RouteList car={c} />
          </div>
        )
      })}

      <div className="flex items-center justify-between gap-2 border-t pt-3 text-sm">
        <span>
          <span className="text-muted-foreground">Customer: </span>
          <span className="font-medium">{hire.customer}</span>
        </span>
        <span className="inline-flex items-center gap-0.5 font-medium text-primary">
          Details
          <ChevronRightIcon className="size-4" />
        </span>
      </div>
    </Link>
  )
}
