"use client"

import Link from "next/link"
import { PencilIcon, WalletIcon } from "lucide-react"
import { toast } from "sonner"

import { CarPhoto } from "@/components/bridal/car-art"
import { ConfirmAction } from "@/components/bridal/confirm-action"
import { FilesDialog } from "@/components/bridal/files-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { fmtDate, fmtTime, rs } from "@/lib/bridal/format"
import { cancelBooking, carNames, useBridal } from "@/lib/bridal/store"
import type { Booking, Car } from "@/lib/bridal/types"

export function BookingRow({
  booking: b,
  cars,
  onInvoice,
}: {
  booking: Booking
  // Catalogue entries for the booked cars, for photos.
  cars: (Car | undefined)[]
  onInvoice: (b: Booking) => void
}) {
  const { drivers } = useBridal()
  const driverName = (id?: string) => drivers.find((d) => d.id === id)?.name
  const routes = b.cars.map((c) => ({
    name: c.carName,
    driver: driverName(c.driverId),
    text: [
      `${fmtTime(c.pickupTime)} ${c.pickupLoc}`,
      ...c.stops.map((s) => s.loc),
      `${fmtTime(c.dropTime)} ${c.dropLoc}`,
    ].join(" → "),
  }))

  async function cancel() {
    try {
      await cancelBooking(b.id)
      toast.success("Booking cancelled")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel. Try again.")
    }
  }

  return (
    <Item variant="outline" className="items-start">
      <ItemMedia className="w-24 flex-col items-stretch gap-1 overflow-hidden rounded-lg sm:w-32">
        {b.cars.map((bc, i) => (
          <CarPhoto
            key={`${bc.carId}-${i}`}
            car={cars[i] ?? { name: bc.carName, hex: "#999999", style: "sedan" }}
            sizes="128px"
            className="rounded-lg"
          />
        ))}
      </ItemMedia>
      <ItemContent className="min-w-48">
        <ItemTitle className="flex-wrap">
          {b.customer}
          <Badge variant="outline" className="font-mono">
            {b.invNo}
          </Badge>
          <Badge variant="secondary">{b.type}</Badge>
          {b.status === "cancelled" && <Badge variant="destructive">Cancelled</Badge>}
          {b.deco === "fresh" && <Badge variant="outline">Fresh flowers</Badge>}
        </ItemTitle>
        <ItemDescription className="line-clamp-none">
          {fmtDate(b.date)} · {carNames(b)} · {b.phone}
        </ItemDescription>
        {routes.map((r, i) => (
          <ItemDescription key={i} className="line-clamp-none">
            {routes.length > 1 && <span className="font-medium text-foreground">{r.name}: </span>}
            {r.text}
            <span className={r.driver ? "text-foreground" : "text-destructive/80"}>
              {" "}
              · {r.driver ? `Driver: ${r.driver}` : "No driver yet"}
            </span>
          </ItemDescription>
        ))}
        {b.decoNotes?.trim() && (
          <ItemDescription className="line-clamp-none whitespace-pre-line">
            <span className="font-medium text-foreground">Decoration notes: </span>
            {b.decoNotes.trim()}
          </ItemDescription>
        )}
      </ItemContent>
      <ItemActions className="ml-auto flex-wrap justify-end self-center">
        <span className="grid text-right">
          <span className="font-semibold tabular-nums">{rs(b.total)}</span>
          {b.discount > 0 && <span className="text-xs text-muted-foreground">after {rs(b.discount)} discount</span>}
        </span>
        <Button size="sm" variant="outline" onClick={() => onInvoice(b)}>
          Invoice
        </Button>
        {b.status !== "cancelled" && (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/admin/dashboard/bookings/${b.id}/edit`}>
              <PencilIcon data-icon="inline-start" />
              Edit
            </Link>
          </Button>
        )}
        {b.status !== "cancelled" && (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/admin/dashboard/finance?hire=${encodeURIComponent(b.id)}`}>
              <WalletIcon data-icon="inline-start" />
              Income &amp; expenses
            </Link>
          </Button>
        )}
        <FilesDialog
          ownerType="booking"
          ownerId={b.id}
          title={`Files · ${b.invNo}`}
          description="Agreement, customer ID copy, payment slips. Drivers assigned to this hire can view them."
        />
        {b.status !== "cancelled" && (
          <ConfirmAction
            trigger={
              <Button size="sm" variant="destructive">
                Cancel
              </Button>
            }
            title="Cancel this booking?"
            description={`${b.customer}'s hire of ${carNames(b)} on ${fmtDate(b.date)} will be marked cancelled and the cars freed for that day.`}
            confirmLabel="Cancel booking"
            onConfirm={cancel}
          />
        )}
      </ItemActions>
    </Item>
  )
}
