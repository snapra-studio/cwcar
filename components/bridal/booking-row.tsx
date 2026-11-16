"use client"

import Link from "next/link"
import { PencilIcon, WalletIcon } from "lucide-react"
import { toast } from "sonner"

import { CarPhoto } from "@/components/bridal/car-art"
import { FilesDialog } from "@/components/bridal/files-dialog"
import { ReasonDialog } from "@/components/bridal/reason-dialog"
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
import { useAdminMe } from "@/components/bridal/admin-me"
import { cancelBooking, carNames, removeBooking, useBridal } from "@/lib/bridal/store"
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
  // Managers can look and add income / expenses, not edit, cancel or open files.
  const manager = useAdminMe()?.role === "manager"
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

  // Both keep the hire on record (with the reason) for the reports.
  async function cancel(reason: string) {
    await cancelBooking(b.id, reason)
    toast.success(`${b.invNo} cancelled`)
  }
  async function remove(reason: string) {
    await removeBooking(b.id, reason)
    toast.success(`${b.invNo} removed from the list`)
  }
  const live = b.status === "confirmed"

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
          {b.status === "removed" && <Badge variant="secondary">Removed</Badge>}
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
        {!live && b.closedReason && (
          <ItemDescription className="line-clamp-none text-destructive/90">
            {b.status === "removed" ? "Removed" : "Cancelled"}
            {b.closedAt && ` on ${fmtDate(b.closedAt.slice(0, 10))}`}: {b.closedReason}
          </ItemDescription>
        )}
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
        {live && !manager && (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/admin/dashboard/bookings/${b.id}/edit`}>
              <PencilIcon data-icon="inline-start" />
              Edit
            </Link>
          </Button>
        )}
        {live && (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/admin/dashboard/finance?hire=${encodeURIComponent(b.id)}`}>
              <WalletIcon data-icon="inline-start" />
              Income &amp; expenses
            </Link>
          </Button>
        )}
        {!manager && (
          <FilesDialog
            ownerType="booking"
            ownerId={b.id}
            title={`Files · ${b.invNo}`}
            description="Agreement, customer ID copy, payment slips. Drivers assigned to this hire can view them."
          />
        )}
        {live && !manager && (
          <ReasonDialog
            trigger={
              <Button size="sm" variant="destructive">
                Cancel
              </Button>
            }
            title={`Cancel ${b.invNo}?`}
            description={`${b.customer}'s hire of ${carNames(b)} on ${fmtDate(b.date)} is marked cancelled and the cars are freed. It stays on record (with the reason) for the reports.`}
            confirmLabel="Cancel hire"
            onConfirm={cancel}
          />
        )}
        {live && !manager && (
          <ReasonDialog
            trigger={
              <Button size="sm" variant="outline">
                Remove
              </Button>
            }
            title={`Remove ${b.invNo} from the list?`}
            description="For an incorrect or duplicate entry. The hire leaves the active list and the cars are freed; it stays on record (with the reason) for the reports."
            confirmLabel="Remove hire"
            onConfirm={remove}
          />
        )}
      </ItemActions>
    </Item>
  )
}
