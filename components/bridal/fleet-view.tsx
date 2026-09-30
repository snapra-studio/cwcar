"use client"

import * as React from "react"
import { ImagePlusIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { CarPhoto, Swatch } from "@/components/bridal/car-art"
import { ConfirmAction } from "@/components/bridal/confirm-action"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { fmtDate, rs, todayIso } from "@/lib/bridal/format"
import { fileToCarImage } from "@/lib/bridal/image"
import {
  addCar,
  isActive,
  removeCar,
  saveSettings,
  setCarImage,
  sortCars,
  updateCar,
  useBridal,
} from "@/lib/bridal/store"
import { isPartner, type Car, type CarStyle, type Fleet } from "@/lib/bridal/types"

const STYLE_LABEL: Record<CarStyle, string> = { sedan: "Sedan", vintage: "Vintage", suv: "SUV" }

export function FleetView() {
  const { ready } = useBridal()
  if (!ready) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-96 rounded-3xl" />
        ))}
      </div>
    )
  }
  return (
    <div className="grid gap-8">
      <FleetGrid />
      <div className="max-w-2xl">
        <SettingsForm />
      </div>
    </div>
  )
}

// Hidden file input behind a button; resizes the photo before handing it back.
export function PhotoPicker({
  onPick,
  maxWidth,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick"> & {
  onPick: (image: string) => void
  // Resize limit in pixels; the landing background needs more than car cards.
  maxWidth?: number
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)

  async function change(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setBusy(true)
    try {
      onPick(await fileToCarImage(file, maxWidth))
    } catch {
      toast.error("Could not read that photo. Try a JPG or PNG.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={change} />
      <Button type="button" disabled={busy} onClick={() => inputRef.current?.click()} {...props}>
        {children}
      </Button>
    </>
  )
}

async function saveImage(id: string, image: string | undefined) {
  try {
    await setCarImage(id, image)
    toast.success(image ? "Photo updated" : "Photo removed")
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Could not save the photo. Try a smaller one.")
  }
}

function FleetGrid() {
  const { cars, bookings } = useBridal()
  const today = todayIso()

  if (!cars.length) {
    return (
      <Card>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No cars yet</EmptyTitle>
            <EmptyDescription>Add your first vehicle to start taking bookings.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <AddCarDialog label="Add a new vehicle" />
          </EmptyContent>
        </Empty>
      </Card>
    )
  }

  const nextHire = (id: string) =>
    bookings
      .filter((b) => isActive(b) && b.date >= today && b.cars.some((x) => x.carId === id))
      .sort((a, b) => a.date.localeCompare(b.date))[0]?.date
  const own = sortCars(cars).filter((c) => !isPartner(c))
  const partner = sortCars(cars).filter(isPartner)

  return (
    <div className="grid gap-10">
      <section className="grid gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium tracking-widest text-primary uppercase">The collection</p>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Our fleet</h2>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <p className="max-w-sm text-sm text-muted-foreground">
              Our own vehicles. Upload a photo for each car — front-on shots against a dark background look best.
            </p>
            <AddCarDialog label="Add a new vehicle" />
          </div>
        </div>
        {own.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
            {own.map((c) => (
              <FleetCard key={c.id} car={c} nextHire={nextHire(c.id)} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No own vehicles yet.</p>
        )}
      </section>

      <section className="grid gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium tracking-widest text-primary uppercase">Rented in</p>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Partner fleet</h2>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <p className="max-w-sm text-sm text-muted-foreground">
              Vehicles we rent from other owners and hire out ourselves. What we pay the owner counts as an expense
              on each hire.
            </p>
            <AddCarDialog fleet="partner" label="Add partner vehicle" />
          </div>
        </div>
        {partner.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
            {partner.map((c) => (
              <FleetCard key={c.id} car={c} nextHire={nextHire(c.id)} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No partner vehicles yet. Use &ldquo;Add partner vehicle&rdquo; to add one.
          </p>
        )}
      </section>
    </div>
  )
}

function FleetCard({ car: c, nextHire }: { car: Car; nextHire?: string }) {
  return (
    <article className="group/photo overflow-hidden rounded-3xl border bg-card transition-colors hover:border-primary/40">
      <div className="relative">
        <CarPhoto car={c} sizes="(min-width: 1024px) 33vw, 100vw" />
        <span className="absolute top-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
          {STYLE_LABEL[c.style]}
        </span>
        <span className="absolute top-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white/85 backdrop-blur">
          {nextHire ? `Next: ${fmtDate(nextHire)}` : "Free"}
        </span>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
          <h3 className="text-xl font-semibold text-white">{c.name}</h3>
        </div>
      </div>
      <div className="grid gap-4 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5">
            <Swatch hex={c.hex} /> {c.color}
          </span>
          {c.plate && <span className="rounded-full border px-2.5 py-0.5">{c.plate}</span>}
          {isPartner(c) && (
            <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-foreground">
              Owner: {c.ownerName}
              {c.ownerPhone && ` · ${c.ownerPhone}`}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-2xl font-bold tabular-nums">{rs(c.rate)}</div>
            <div className="text-xs text-muted-foreground">
              per day{isPartner(c) && ` · we pay owner ${rs(c.ownerCost ?? 0)}`}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            <PhotoPicker
              variant="outline"
              size="sm"
              className="rounded-full"
              onPick={(image) => saveImage(c.id, image)}
            >
              <ImagePlusIcon data-icon="inline-start" />
              {c.image ? "Change photo" : "Add photo"}
            </PhotoPicker>
            {c.image && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full"
                aria-label="Remove photo"
                onClick={() => saveImage(c.id, undefined)}
              >
                <Trash2Icon />
              </Button>
            )}
            <EditCarDialog car={c} />
            <ConfirmAction
              trigger={
                <Button size="sm" variant="destructive" className="rounded-full">
                  Remove
                </Button>
              }
              title={`Remove ${c.name}?`}
              description="The car disappears from the fleet and calendar. Existing bookings and invoices keep its name."
              confirmLabel="Remove car"
              onConfirm={async () => {
                try {
                  await removeCar(c.id)
                  toast.success("Car removed")
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not remove. Try again.")
                }
              }}
            />
          </div>
        </div>
      </div>
    </article>
  )
}

const EMPTY_CAR = {
  name: "",
  color: "",
  hex: "#C8102E",
  style: "sedan" as CarStyle,
  plate: "",
  rate: "",
  image: undefined as string | undefined,
  fleet: "own" as Fleet,
  ownerName: "",
  ownerPhone: "",
  ownerCost: "",
}

const toFormCar = (c: Car): typeof EMPTY_CAR => ({
  ...EMPTY_CAR,
  ...c,
  rate: String(c.rate),
  image: c.image,
  fleet: c.fleet ?? "own",
  ownerName: c.ownerName ?? "",
  ownerPhone: c.ownerPhone ?? "",
  ownerCost: c.ownerCost ? String(c.ownerCost) : "",
})

// "+ Add a new vehicle" button; the form opens in a pop-up and closes once the
// car is saved. `fleet` preselects Our fleet or Partner fleet.
function AddCarDialog({ fleet = "own", label }: { fleet?: Fleet; label: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="rounded-full px-5">
          <PlusIcon data-icon="inline-start" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{fleet === "partner" ? "Add a partner vehicle" : "Add a new vehicle"}</DialogTitle>
          <DialogDescription>It appears in the calendar and booking form straight away.</DialogDescription>
        </DialogHeader>
        <CarForm
          idPrefix={`new-${fleet}`}
          initial={{ ...EMPTY_CAR, fleet }}
          submitLabel="Add vehicle"
          onCancel={() => setOpen(false)}
          onSave={async (car) => {
            await addCar(car)
            toast.success(`${car.name} added`)
            setOpen(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function EditCarDialog({ car: c }: { car: Car }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="rounded-full">
          <PencilIcon data-icon="inline-start" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit {c.name}</DialogTitle>
          <DialogDescription>
            Changes apply to new bookings. Existing bookings and invoices keep their original details.
          </DialogDescription>
        </DialogHeader>
        <CarForm
          idPrefix={`edit-${c.id}`}
          initial={toFormCar(c)}
          submitLabel="Save changes"
          onCancel={() => setOpen(false)}
          onSave={async (car) => {
            await updateCar(c.id, car)
            toast.success("Car updated")
            setOpen(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function CarForm({
  idPrefix,
  initial = EMPTY_CAR,
  submitLabel,
  onSave,
  onCancel,
}: {
  idPrefix: string
  initial?: typeof EMPTY_CAR
  submitLabel: string
  // Rejects with a message to show if the server refuses the save.
  onSave: (car: Omit<Car, "id">) => Promise<void>
  onCancel?: () => void
}) {
  const [car, setCar] = React.useState(initial)
  const [error, setError] = React.useState("")
  const id = (name: string) => `${idPrefix}-${name}`

  const set = <K extends Exclude<keyof typeof EMPTY_CAR, "image">>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setCar((c) => ({ ...c, [key]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const rate = Number(car.rate) || 0
    if (!car.name.trim() || !car.color.trim() || !rate) {
      setError("Add model, colour name and day rate.")
      return
    }
    const partner = car.fleet === "partner"
    if (partner && !car.ownerName.trim()) {
      setError("Add the owner's name for a partner car.")
      return
    }
    try {
      await onSave({
        name: car.name.trim(),
        color: car.color.trim(),
        hex: car.hex,
        style: car.style,
        plate: car.plate.trim(),
        rate,
        image: car.image,
        fleet: car.fleet,
        ...(partner && {
          ownerName: car.ownerName.trim(),
          ownerPhone: car.ownerPhone.trim(),
          ownerCost: Math.max(0, Number(car.ownerCost) || 0),
        }),
      })
      if (!onCancel) setCar(EMPTY_CAR)
      setError("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try a smaller photo.")
    }
  }

  return (
        <form onSubmit={submit} noValidate>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={id("cName")}>Model</FieldLabel>
                <Input id={id("cName")} placeholder="BMW 520d" value={car.name} onChange={set("name")} />
              </Field>
              <Field>
                <FieldLabel htmlFor={id("cColor")}>Colour name</FieldLabel>
                <Input id={id("cColor")} placeholder="Red" value={car.color} onChange={set("color")} />
              </Field>
              <Field>
                <FieldLabel htmlFor={id("cHex")}>Colour</FieldLabel>
                <Input id={id("cHex")} type="color" className="p-1" value={car.hex} onChange={set("hex")} />
              </Field>
              <Field>
                <FieldLabel htmlFor={id("cStyle")}>Body</FieldLabel>
                <NativeSelect id={id("cStyle")} className="w-full" value={car.style} onChange={set("style")}>
                  <NativeSelectOption value="sedan">Sedan</NativeSelectOption>
                  <NativeSelectOption value="vintage">Vintage</NativeSelectOption>
                  <NativeSelectOption value="suv">SUV</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor={id("cPlate")}>Plate no.</FieldLabel>
                <Input id={id("cPlate")} placeholder="CAB-1234" value={car.plate} onChange={set("plate")} />
              </Field>
              <Field>
                <FieldLabel htmlFor={id("cRate")}>Day rate (Rs)</FieldLabel>
                <Input
                  id={id("cRate")}
                  type="number"
                  min={0}
                  step={500}
                  placeholder="35000"
                  value={car.rate}
                  onChange={set("rate")}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={id("cFleet")}>Fleet</FieldLabel>
                <NativeSelect id={id("cFleet")} className="w-full" value={car.fleet} onChange={set("fleet")}>
                  <NativeSelectOption value="own">Our fleet (own vehicle)</NativeSelectOption>
                  <NativeSelectOption value="partner">Partner fleet (rented from an owner)</NativeSelectOption>
                </NativeSelect>
              </Field>
              {car.fleet === "partner" && (
                <>
                  <Field>
                    <FieldLabel htmlFor={id("cOwner")}>Owner name</FieldLabel>
                    <Input id={id("cOwner")} placeholder="Mr. Perera" value={car.ownerName} onChange={set("ownerName")} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={id("cOwnerPhone")}>Owner phone</FieldLabel>
                    <Input id={id("cOwnerPhone")} type="tel" value={car.ownerPhone} onChange={set("ownerPhone")} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={id("cOwnerCost")}>We pay owner per hire (Rs)</FieldLabel>
                    <Input
                      id={id("cOwnerCost")}
                      type="number"
                      min={0}
                      step={500}
                      placeholder="25000"
                      value={car.ownerCost}
                      onChange={set("ownerCost")}
                    />
                    <FieldDescription>Counted as an expense on every hire of this car.</FieldDescription>
                  </Field>
                </>
              )}
            </div>
            <Field>
              <FieldLabel>Photo</FieldLabel>
              <div className="group/photo grid gap-3 sm:grid-cols-[240px_1fr] sm:items-center">
                <CarPhoto car={{ ...car, name: car.name || "New car" }} sizes="240px" className="rounded-xl" />
                <div className="grid gap-2">
                  <div className="flex gap-2">
                    <PhotoPicker
                      variant="outline"
                      className="rounded-full"
                      onPick={(image) => setCar((c) => ({ ...c, image }))}
                    >
                      <ImagePlusIcon data-icon="inline-start" />
                      {car.image ? "Change photo" : "Upload photo"}
                    </PhotoPicker>
                    {car.image && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="rounded-full"
                        onClick={() => setCar((c) => ({ ...c, image: undefined }))}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <FieldDescription>
                    Optional. Without a photo we show a drawing in the car&apos;s colour.
                  </FieldDescription>
                </div>
              </div>
            </Field>
            {error && <FieldError>{error}</FieldError>}
            <div className="flex gap-2">
              <Button type="submit" size="lg" className="rounded-full px-5">
                {submitLabel}
              </Button>
              {onCancel && (
                <Button type="button" size="lg" variant="outline" className="rounded-full px-5" onClick={onCancel}>
                  Cancel
                </Button>
              )}
            </div>
          </FieldGroup>
        </form>
  )
}

function SettingsForm() {
  const { settings } = useBridal()
  const [form, setForm] = React.useState(settings)

  const set = <K extends keyof typeof settings>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await saveSettings({
        ...settings,
        bizName: form.bizName.trim() || "Crish Wedding Cars & Rentals",
        bizPhone: form.bizPhone.trim(),
        bizAddr: form.bizAddr.trim(),
        bizEmail: form.bizEmail.trim(),
        bankBranch: form.bankBranch.trim(),
        accountNo: form.accountNo.trim(),
        accountName: form.accountName.trim(),
      })
      toast.success("Saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save. Try again.")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Invoice details</CardTitle>
        <CardDescription>Shown at the top of every invoice.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="bName">Business name</FieldLabel>
              <Input id="bName" value={form.bizName} onChange={set("bizName")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="bPhone">Phone</FieldLabel>
              <Input id="bPhone" type="tel" value={form.bizPhone} onChange={set("bizPhone")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="bAddr">Address</FieldLabel>
              <Textarea id="bAddr" rows={2} value={form.bizAddr} onChange={set("bizAddr")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="bEmail">Email</FieldLabel>
              <Input id="bEmail" type="email" value={form.bizEmail} onChange={set("bizEmail")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="bBank">Bank &amp; branch</FieldLabel>
              <Input id="bBank" value={form.bankBranch} onChange={set("bankBranch")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="bAccNo">Account number</FieldLabel>
              <Input id="bAccNo" value={form.accountNo} onChange={set("accountNo")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="bAccName">Account name</FieldLabel>
              <Input id="bAccName" value={form.accountName} onChange={set("accountName")} />
            </Field>
            <div>
              <Button type="submit" size="lg" className="rounded-full px-5">
                Save
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
