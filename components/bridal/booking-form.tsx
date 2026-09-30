"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CopyIcon, FlowerIcon, HeartIcon, HouseIcon, PlusIcon, SproutIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { CarPhoto } from "@/components/bridal/car-art"
import { InvoiceDialog } from "@/components/bridal/invoice-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { fmtDate, FRESH_FLOWER_COST, rs, todayIso, uid } from "@/lib/bridal/format"
import {
  addBooking,
  bookingMoney,
  carSlotsOn,
  describeGap,
  fmtMinutes,
  freeGaps,
  sortCars,
  toMinutes,
  updateBooking,
  useBridal,
} from "@/lib/bridal/store"
import {
  isPartner,
  type Booking,
  type BookingInput,
  type Car,
  type Decoration,
  type Driver,
  type EventType,
  type Route,
} from "@/lib/bridal/types"
import { cn } from "@/lib/utils"

type StopRow = { key: string; time: string; loc: string }
type RouteRows = Omit<Route, "stops"> & { stops: StopRow[] }
// driverId "" = no driver assigned yet.
type PickedCar = { carId: string; amount: string; ownerCost: string; driverId: string; route: RouteRows }

const EMPTY_ROUTE: RouteRows = { pickupTime: "", pickupLoc: "", stops: [], dropTime: "", dropLoc: "" }

// Copy with fresh stop keys so the two cars' stop lists stay independent.
const cloneRoute = (r: RouteRows): RouteRows => ({ ...r, stops: r.stops.map((s) => ({ ...s, key: uid() })) })

const EMPTY = {
  type: "Wedding" as EventType,
  customer: "",
  phone: "",
  address: "",
  deco: "artificial" as Decoration,
  decoNotes: "",
  discount: "0",
  advance: "0",
}

type FormProps = { initialDate?: string; initialCarId?: string; bookingId?: string }

export function BookingForm(props: FormProps) {
  const { ready, bookings } = useBridal()
  if (!ready) {
    return (
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Skeleton className="h-[720px] rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    )
  }
  const editing = props.bookingId ? bookings.find((b) => b.id === props.bookingId) : undefined
  if (props.bookingId && !editing) {
    return (
      <Card>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Booking not found</EmptyTitle>
            <EmptyDescription>
              It may have been saved on another device. <Link href="/dashboard/history">Back to history</Link>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Card>
    )
  }
  return <BookingFormInner {...props} editing={editing} />
}

// Partner cars start with the owner's usual charge; own cars have none.
const defaultOwnerCost = (c: Car) => (isPartner(c) ? String(c.ownerCost ?? "") : "")

const toRows = (r: Route): RouteRows => ({ ...r, stops: r.stops.map((s) => ({ ...s, key: uid() })) })

function BookingFormInner({
  initialDate,
  initialCarId,
  editing,
}: FormProps & { editing?: Booking }) {
  const { cars, bookings, drivers } = useBridal()
  const router = useRouter()
  const [saving, setSaving] = React.useState(false)
  const [date, setDate] = React.useState(editing?.date || initialDate || todayIso)
  // Selected cars in the order they were picked, each with its own hire
  // amount and route.
  const [picked, setPicked] = React.useState<PickedCar[]>(() => {
    if (editing) {
      return editing.cars.map((c) => ({
        carId: c.carId,
        amount: String(c.rate),
        ownerCost: String(c.ownerCost ?? ""),
        driverId: c.driverId ?? "",
        route: toRows(c),
      }))
    }
    const first = cars.find((c) => c.id === initialCarId)
    // Cars are booked by time slot now, so a car with other hires that day
    // can still be picked; the route's times are checked instead.
    return first
      ? [{ carId: first.id, amount: String(first.rate), ownerCost: defaultOwnerCost(first), driverId: "", route: EMPTY_ROUTE }]
      : []
  })
  const [form, setForm] = React.useState(() =>
    editing
      ? {
          type: editing.type,
          customer: editing.customer,
          phone: editing.phone,
          address: editing.address,
          deco: editing.deco,
          decoNotes: editing.decoNotes ?? "",
          discount: String(editing.discount ?? 0),
          advance: String(editing.advance),
        }
      : EMPTY
  )
  const [error, setError] = React.useState("")
  const [invoice, setInvoice] = React.useState<Booking | null>(null)

  const set = <K extends keyof typeof EMPTY>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  // A car removed from the catalogue after this order was made stays on the
  // order under its saved name.
  const removedCars: Car[] = (editing?.cars ?? [])
    .filter((bc) => !cars.some((c) => c.id === bc.carId))
    .map((bc) => ({
      id: bc.carId,
      name: bc.carName,
      color: "",
      hex: "#999999",
      style: "sedan",
      plate: "",
      rate: bc.rate,
      fleet: bc.fleet,
      ownerName: bc.ownerName,
      ownerCost: bc.ownerCost,
    }))
  const allCars = [...sortCars(cars), ...removedCars]
  // This car's other active hires on the chosen date (not counting the
  // booking being edited), as time slots.
  const daySlots = (carId: string) => carSlotsOn(bookings, carId, date, editing?.id)
  const slotText = (x: { start: number; end: number }) => `${fmtMinutes(x.start)} – ${fmtMinutes(x.end)}`

  // What's wrong with a car's times, if anything: drop-off not after pick-up,
  // or overlapping another hire of the same car (same rule as the server).
  function timeIssue(carId: string, route: RouteRows) {
    const start = toMinutes(route.pickupTime)
    const end = toMinutes(route.dropTime)
    if (Number.isNaN(start) || Number.isNaN(end)) return ""
    if (end <= start) return "The drop-off time must be later than the pick-up time."
    const hit = daySlots(carId).filter((x) => start < x.end && end > x.start)
    if (!hit.length) return ""
    return `Overlaps another hire of this car: ${hit.map((x) => `${slotText(x)} (${x.booking.invNo})`).join(", ")}.`
  }

  const selected = picked.flatMap((p) => {
    const car = allCars.find((c) => c.id === p.carId)
    if (!car) return []
    return [
      {
        car,
        amount: Math.max(0, Number(p.amount) || 0),
        raw: p.amount,
        ownerCost: Math.max(0, Number(p.ownerCost) || 0),
        rawOwnerCost: p.ownerCost,
        driverId: p.driverId,
        route: p.route,
      },
    ]
  })
  const rate = selected.reduce((sum, s) => sum + s.amount, 0)
  const decoCost = form.deco === "fresh" ? FRESH_FLOWER_COST * selected.length : 0
  const advance = Math.max(0, Number(form.advance) || 0)
  const discountIn = Math.max(0, Number(form.discount) || 0)
  // Same maths as the server and the invoice (lib/bridal/logic.ts).
  const { subtotal, discount, total, balance } = bookingMoney({ rate, decoCost, discount: discountIn, advance })

  // Ticking a car pre-fills its standard rate and a copy of the first car's
  // route; both stay editable per car.
  function toggleCar(id: string, on: boolean) {
    const car = allCars.find((c) => c.id === id)
    setPicked((all) =>
      on && car
        ? all.some((p) => p.carId === id)
          ? all
          : [
              ...all,
              {
                carId: id,
                amount: String(car.rate),
                ownerCost: defaultOwnerCost(car),
                driverId: "",
                route: all[0] ? cloneRoute(all[0].route) : EMPTY_ROUTE,
              },
            ]
        : all.filter((p) => p.carId !== id)
    )
  }

  function setAmount(id: string, amount: string) {
    setPicked((all) => all.map((p) => (p.carId === id ? { ...p, amount } : p)))
  }

  function setDriver(id: string, driverId: string) {
    setPicked((all) => all.map((p) => (p.carId === id ? { ...p, driverId } : p)))
  }

  function setOwnerCost(id: string, ownerCost: string) {
    setPicked((all) => all.map((p) => (p.carId === id ? { ...p, ownerCost } : p)))
  }

  function setRoute(id: string, route: RouteRows) {
    setPicked((all) => all.map((p) => (p.carId === id ? { ...p, route } : p)))
  }

  function changeDate(value: string) {
    // Picked cars stay; their times are re-checked against the new date.
    setDate(value)
  }

  function reset() {
    setForm(EMPTY)
    setPicked([])
    setError("")
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    const missing: string[] = []
    if (!date) missing.push("date")
    if (!selected.length) missing.push("at least one car")
    if (!form.customer.trim()) missing.push("customer name")
    if (!form.phone.trim()) missing.push("phone")
    for (const s of selected) {
      if (!s.route.pickupTime || !s.route.pickupLoc.trim()) missing.push(`${s.car.name} pick-up`)
      if (!s.route.dropTime || !s.route.dropLoc.trim()) missing.push(`${s.car.name} drop-off`)
    }
    if (selected.some((s) => !(s.amount > 0))) missing.push("hire amount for every car")
    if (missing.length) {
      setError(`Add: ${missing.join(", ")}.`)
      return
    }
    const issues = selected.flatMap((s) => {
      const issue = timeIssue(s.car.id, s.route)
      return issue ? [`${s.car.name}: ${issue}`] : []
    })
    if (issues.length) {
      setError(issues.join(" "))
      return
    }
    if (discountIn > subtotal) {
      setError("The discount can't be more than the hire amount.")
      return
    }
    const isRemoved = (id: string) => removedCars.some((c) => c.id === id)
    setSaving(true)
    try {
      const input: BookingInput = {
        date,
        cars: selected.map((s) => ({
          carId: s.car.id,
          carName: isRemoved(s.car.id) ? s.car.name : `${s.car.name} (${s.car.color})`,
          rate: s.amount,
          ...(isPartner(s.car) && { fleet: "partner" as const, ownerName: s.car.ownerName, ownerCost: s.ownerCost }),
          ...(s.driverId && { driverId: s.driverId }),
          pickupTime: s.route.pickupTime,
          pickupLoc: s.route.pickupLoc.trim(),
          stops: s.route.stops.map((x) => ({ time: x.time, loc: x.loc.trim() })).filter((x) => x.loc),
          dropTime: s.route.dropTime,
          dropLoc: s.route.dropLoc.trim(),
        })),
        type: form.type,
        customer: form.customer.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        deco: form.deco,
        decoNotes: form.decoNotes.trim(),
        rate,
        decoCost,
        discount,
        total,
        advance,
        balance,
      }
      if (editing) {
        const booking = await updateBooking(editing.id, input)
        toast.success(`Booking updated · invoice revision ${booking.revision}`)
        setInvoice(booking)
      } else {
        const booking = await addBooking(input)
        toast.success("Booking saved")
        reset()
        setInvoice(booking)
      }
    } catch (err) {
      // The server re-checks everything, including double-booking.
      setError(err instanceof Error ? err.message : "Could not save. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
      <Card>
        <CardContent>
          <form onSubmit={submit} noValidate>
            <FieldGroup>
              <FieldSet>
                <FieldLegend>Date &amp; cars</FieldLegend>
                <Field className="max-w-60">
                  <FieldLabel htmlFor="date">Hire date</FieldLabel>
                  <Input id="date" type="date" value={date} onChange={(e) => changeDate(e.target.value)} />
                </Field>
                {cars.length === 0 ? (
                  <FieldDescription>
                    No cars yet. <Link href="/dashboard/cars">Add a car</Link> first.
                  </FieldDescription>
                ) : (
                  <>
                  <FieldDescription>Tick one or more cars for this order.</FieldDescription>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
                    {allCars.map((c) => {
                      const slots = daySlots(c.id)
                      const on = picked.some((p) => p.carId === c.id)
                      return (
                        <FieldLabel
                          key={c.id}
                          htmlFor={`car-${c.id}`}
                          className={cn(on && "border-primary bg-primary/10 ring-1 ring-primary")}
                        >
                          <Field orientation="horizontal">
                            <FieldContent>
                              <CarPhoto car={c} sizes="200px" className="rounded-md" />
                              <FieldTitle className="flex-wrap">
                                {c.name}
                                {isPartner(c) && <Badge variant="outline">Partner</Badge>}
                              </FieldTitle>
                              <FieldDescription className="flex w-full justify-between gap-2">
                                <span>{c.color}</span>
                                <span className="font-medium text-foreground">{rs(c.rate)}</span>
                              </FieldDescription>
                              {slots.length > 0 && (
                                <div className="grid gap-0.5 text-xs">
                                  <Badge variant="secondary" className="w-fit">
                                    {slots.length} hire{slots.length === 1 ? "" : "s"} this day
                                  </Badge>
                                  {slots.map((x, i) => (
                                    <span key={i} className="text-muted-foreground">
                                      Booked {slotText(x)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </FieldContent>
                            <Checkbox
                              id={`car-${c.id}`}
                              checked={on}
                              onCheckedChange={(v) => toggleCar(c.id, v === true)}
                              className="data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                            />
                          </Field>
                        </FieldLabel>
                      )
                    })}
                  </div>
                  </>
                )}
              </FieldSet>

              <FieldSeparator />

              <FieldSet>
                <FieldLegend>Event</FieldLegend>
                <RadioGroup
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v as EventType }))}
                  className="grid-cols-2"
                >
                  {([
                    ["Wedding", HeartIcon],
                    ["Homecoming", HouseIcon],
                  ] as const).map(([value, Icon]) => (
                    <FieldLabel key={value} htmlFor={`type-${value}`}>
                      <Field orientation="horizontal">
                        <Icon className="size-5 text-muted-foreground" />
                        <FieldTitle className="flex-1">{value}</FieldTitle>
                        <RadioGroupItem value={value} id={`type-${value}`} />
                      </Field>
                    </FieldLabel>
                  ))}
                </RadioGroup>
              </FieldSet>

              <FieldSeparator />

              <FieldSet>
                <FieldLegend>Customer</FieldLegend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="customer">Name</FieldLabel>
                    <Input
                      id="customer"
                      autoFocus={!!initialCarId}
                      autoComplete="off"
                      value={form.customer}
                      onChange={set("customer")}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="phone">Phone</FieldLabel>
                    <Input
                      id="phone"
                      type="tel"
                      inputMode="tel"
                      placeholder="07X XXX XXXX"
                      value={form.phone}
                      onChange={set("phone")}
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="address">Address</FieldLabel>
                  <Textarea id="address" rows={2} value={form.address} onChange={set("address")} />
                </Field>
              </FieldSet>

              <FieldSeparator />

              <FieldSet>
                <FieldLegend>Routes</FieldLegend>
                {selected.length === 0 ? (
                  <FieldDescription>Tick a car above to add its pick-up, stops and drop-off.</FieldDescription>
                ) : (
                  <>
                    {selected.length > 1 && (
                      <FieldDescription>
                        Each car can have its own times and places. New cars start with a copy of the first car&apos;s route.
                      </FieldDescription>
                    )}
                    {selected.map((s, i) => (
                      <RouteEditor
                        key={s.car.id}
                        idPrefix={s.car.id}
                        title={selected.length > 1 ? s.car.name : undefined}
                        route={s.route}
                        onChange={(route) => setRoute(s.car.id, route)}
                        onCopyFirst={
                          i > 0 ? () => setRoute(s.car.id, cloneRoute(selected[0].route)) : undefined
                        }
                        firstName={selected[0].car.name}
                        booked={daySlots(s.car.id)}
                        // Hidden while saving: the new hire lands in the data just before the form resets.
                        timeIssue={saving ? "" : timeIssue(s.car.id, s.route)}
                        drivers={drivers.filter((d) => d.status === "active" || d.id === s.driverId)}
                        driverId={s.driverId}
                        onDriverChange={(driverId) => setDriver(s.car.id, driverId)}
                      />
                    ))}
                  </>
                )}
              </FieldSet>

              <FieldSeparator />

              <FieldSet>
                <FieldLegend>Decoration</FieldLegend>
                <RadioGroup
                  value={form.deco}
                  onValueChange={(v) => setForm((f) => ({ ...f, deco: v as Decoration }))}
                  className="sm:grid-cols-2"
                >
                  {([
                    ["artificial", "Artificial flowers", "Complimentary", SproutIcon],
                    ["fresh", "Fresh flowers", `+ ${rs(FRESH_FLOWER_COST)} per car`, FlowerIcon],
                  ] as const).map(([value, title, note, Icon]) => (
                    <FieldLabel key={value} htmlFor={`deco-${value}`}>
                      <Field orientation="horizontal">
                        <Icon className="size-5 text-muted-foreground" />
                        <FieldContent>
                          <FieldTitle>{title}</FieldTitle>
                          <FieldDescription>{note}</FieldDescription>
                        </FieldContent>
                        <RadioGroupItem value={value} id={`deco-${value}`} />
                      </Field>
                    </FieldLabel>
                  ))}
                </RadioGroup>
                <Field>
                  <FieldLabel htmlFor="decoNotes">Other Decoration Details / Customer Request</FieldLabel>
                  <Textarea
                    id="decoNotes"
                    rows={3}
                    maxLength={1000}
                    placeholder="Enter any additional flower decoration details or special customer requests..."
                    value={form.decoNotes}
                    onChange={set("decoNotes")}
                  />
                  <FieldDescription>Shown on the invoice and to the driver.</FieldDescription>
                </Field>
              </FieldSet>

              <FieldSeparator />

              <FieldSet>
                <FieldLegend>Payment</FieldLegend>
                {selected.length === 0 ? (
                  <FieldDescription>Tick a car above to set its hire amount.</FieldDescription>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {selected.map((s) => (
                      <React.Fragment key={s.car.id}>
                        <Field>
                          <FieldLabel htmlFor={`amount-${s.car.id}`}>{s.car.name} (Rs)</FieldLabel>
                          <Input
                            id={`amount-${s.car.id}`}
                            type="number"
                            min={0}
                            step={500}
                            placeholder={String(s.car.rate)}
                            value={s.raw}
                            onChange={(e) => setAmount(s.car.id, e.target.value)}
                          />
                          <FieldDescription>
                            Standard rate {rs(s.car.rate)}. Change it for this booking if needed.
                          </FieldDescription>
                        </Field>
                        {isPartner(s.car) && (
                          <Field>
                            <FieldLabel htmlFor={`owner-${s.car.id}`}>
                              Paid to owner · {s.car.name} (Rs)
                            </FieldLabel>
                            <Input
                              id={`owner-${s.car.id}`}
                              type="number"
                              min={0}
                              step={500}
                              value={s.rawOwnerCost}
                              onChange={(e) => setOwnerCost(s.car.id, e.target.value)}
                            />
                            <FieldDescription>
                              Partner car from {s.car.ownerName || "its owner"}. Not shown on the invoice; counted as an
                              expense.
                            </FieldDescription>
                          </Field>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="discount">Discount Amount (LKR)</FieldLabel>
                    <Input
                      id="discount"
                      type="number"
                      min={0}
                      step={500}
                      value={form.discount}
                      onChange={set("discount")}
                      aria-invalid={discountIn > subtotal}
                    />
                    <FieldDescription>
                      {discountIn > subtotal ? "Can't be more than the hire amount." : "An amount, not a percentage."}
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="advance">Advance paid (Rs)</FieldLabel>
                    <Input
                      id="advance"
                      type="number"
                      min={0}
                      step={500}
                      value={form.advance}
                      onChange={set("advance")}
                    />
                  </Field>
                </div>
                <p className="text-sm text-muted-foreground">
                  Subtotal {rs(subtotal)}
                  {discount > 0 && ` − discount ${rs(discount)}`} = <span className="font-semibold text-foreground">total {rs(total)}</span>{" "}
                  − advance {rs(advance)} = <span className="font-semibold text-foreground">balance {rs(balance)}</span>
                </p>
              </FieldSet>

              {error && <FieldError>{error}</FieldError>}

              <Field orientation="horizontal">
                <Button type="submit" size="lg" className="rounded-full px-5" disabled={saving}>
                  {saving ? "Saving…" : editing ? "Save changes & update invoice" : "Save & create invoice"}
                </Button>
                {editing ? (
                  <Button asChild size="lg" variant="outline" className="rounded-full px-5">
                    <Link href="/dashboard/history">Cancel</Link>
                  </Button>
                ) : (
                  <Button type="button" size="lg" variant="outline" className="rounded-full px-5" onClick={reset}>
                    Clear
                  </Button>
                )}
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Card className="lg:sticky lg:top-4">
        <CardHeader>
          <CardTitle className="text-lg">Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {selected.length ? (
            <div className={cn("grid gap-2", selected.length > 1 && "grid-cols-2")}>
              {selected.map((s) => (
                <CarPhoto key={s.car.id} car={s.car} sizes="400px" className="rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid aspect-[16/10] place-items-center rounded-xl border border-dashed text-muted-foreground">
              Pick one or more cars
            </div>
          )}
          <SummaryLine label="Date" value={date ? fmtDate(date) : "—"} />
          <SummaryLine label="Event" value={form.type} />
          {selected.length ? (
            selected.map((s) => <SummaryLine key={s.car.id} label={s.car.name} value={rs(s.amount)} />)
          ) : (
            <SummaryLine label="Car" value="—" />
          )}
          {selected.length > 1 && <SummaryLine label="Car hire total" value={rs(rate)} />}
          <SummaryLine
            label={
              form.deco === "fresh"
                ? `Fresh flowers${selected.length > 1 ? ` × ${selected.length}` : ""}`
                : "Artificial flowers"
            }
            value={decoCost ? rs(decoCost) : "Free"}
          />
          <Separator />
          <SummaryLine label="Subtotal / hire amount" value={rs(subtotal)} />
          {discount > 0 && <SummaryLine label="Discount" value={`− ${rs(discount)}`} />}
          <div className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span>{rs(total)}</span>
          </div>
          <SummaryLine label="Advance" value={rs(advance)} />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Balance</span>
            <span className="font-semibold">{rs(balance)}</span>
          </div>
        </CardContent>
      </Card>

      <InvoiceDialog
        booking={invoice}
        onOpenChange={(open) => {
          if (open) return
          setInvoice(null)
          // After re-issuing an edited invoice, go back to the booking list.
          if (editing) router.push("/dashboard/history")
        }}
      />
    </div>
  )
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

function RouteEditor({
  idPrefix,
  title,
  route,
  onChange,
  onCopyFirst,
  firstName,
  booked,
  timeIssue,
  drivers,
  driverId,
  onDriverChange,
}: {
  idPrefix: string
  title?: string
  route: RouteRows
  onChange: (route: RouteRows) => void
  onCopyFirst?: () => void
  firstName: string
  // This car's other hires that day, and what's wrong with the chosen times.
  booked: { start: number; end: number }[]
  timeIssue: string
  drivers: Driver[]
  driverId: string
  onDriverChange: (driverId: string) => void
}) {
  const id = (name: string) => `${idPrefix}-${name}`
  const set = (key: "pickupTime" | "pickupLoc" | "dropTime" | "dropLoc") =>
    (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...route, [key]: e.target.value })
  const setStop = (key: string, patch: Partial<StopRow>) =>
    onChange({ ...route, stops: route.stops.map((x) => (x.key === key ? { ...x, ...patch } : x)) })

  return (
    <div className={cn("grid gap-4", title && "rounded-xl border bg-muted/30 p-4")}>
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-medium">{title}</div>
          {onCopyFirst && (
            <Button type="button" size="sm" variant="ghost" onClick={onCopyFirst}>
              <CopyIcon data-icon="inline-start" />
              Same as {firstName}
            </Button>
          )}
        </div>
      )}
      {booked.length > 0 && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
          <span className="font-medium">This car is booked that day: </span>
          {booked.map((x) => `${fmtMinutes(x.start)} – ${fmtMinutes(x.end)}`).join(", ")}
          <span className="text-muted-foreground">
            {" "}
            · Free: {freeGaps(booked).map(describeGap).join(", ") || "none"}
          </span>
        </p>
      )}
      <Field className="sm:max-w-sm">
        <FieldLabel htmlFor={id("driver")}>Driver</FieldLabel>
        <NativeSelect id={id("driver")} className="w-full" value={driverId} onChange={(e) => onDriverChange(e.target.value)}>
          <NativeSelectOption value="">Not assigned yet</NativeSelectOption>
          {drivers.map((d) => (
            <NativeSelectOption key={d.id} value={d.id}>
              {d.name}
              {d.status === "inactive" ? " (switched off)" : ""}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {drivers.length === 0 && (
          <FieldDescription>
            No drivers yet. <Link href="/dashboard/drivers">Add a driver</Link>.
          </FieldDescription>
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-[130px_1fr]">
        <Field>
          <FieldLabel htmlFor={id("pickupTime")}>Pick-up time</FieldLabel>
          <Input id={id("pickupTime")} type="time" value={route.pickupTime} onChange={set("pickupTime")} />
        </Field>
        <Field>
          <FieldLabel htmlFor={id("pickupLoc")}>Pick-up location</FieldLabel>
          <Input id={id("pickupLoc")} value={route.pickupLoc} onChange={set("pickupLoc")} />
        </Field>
      </div>

      {route.stops.map((s, i) => (
        <div key={s.key} className="grid grid-cols-[24px_110px_1fr_auto] items-center gap-2">
          <span className="grid size-6 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
            {i + 1}
          </span>
          <Input
            type="time"
            aria-label={`Stop ${i + 1} time`}
            value={s.time}
            onChange={(e) => setStop(s.key, { time: e.target.value })}
          />
          <Input
            aria-label={`Stop ${i + 1} location`}
            placeholder="Photo location, temple, hotel…"
            value={s.loc}
            onChange={(e) => setStop(s.key, { loc: e.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove stop ${i + 1}`}
            onClick={() => onChange({ ...route, stops: route.stops.filter((x) => x.key !== s.key) })}
          >
            <XIcon />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="border-dashed"
        onClick={() => onChange({ ...route, stops: [...route.stops, { key: uid(), time: "", loc: "" }] })}
      >
        <PlusIcon data-icon="inline-start" />
        Add stop
      </Button>

      <div className="grid gap-4 sm:grid-cols-[130px_1fr]">
        <Field>
          <FieldLabel htmlFor={id("dropTime")}>Drop-off time</FieldLabel>
          <Input id={id("dropTime")} type="time" value={route.dropTime} onChange={set("dropTime")} />
        </Field>
        <Field>
          <FieldLabel htmlFor={id("dropLoc")}>Drop-off location</FieldLabel>
          <Input id={id("dropLoc")} value={route.dropLoc} onChange={set("dropLoc")} />
        </Field>
      </div>
      {timeIssue && <FieldError role="alert">{timeIssue}</FieldError>}
    </div>
  )
}
