"use client"

import * as React from "react"
import { TagIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import type { Car } from "@/lib/bridal/types"
import type { PartnerRates } from "@/lib/partner/pricing"
import { getRatesAction, saveRatesAction } from "@/lib/server/partner-admin-actions"

// One of our cars' prices by hire duration. New customer bookings fill in
// the hire amount from these, and the /inquiry page's estimated bill uses
// them. Empty = no price for that duration ("on request" for partners).

type Key = keyof PartnerRates
const PACKAGES: { key: Key; label: string; hint: string }[] = [
  { key: "rate4h", label: "4 hours", hint: "Hires up to 4 hours" },
  { key: "rate8h", label: "8 hours", hint: "Over 4, up to 8 hours" },
  { key: "rate10h", label: "10 hours", hint: "Over 8, up to 10 hours" },
  { key: "rate12h", label: "12 hours", hint: "Over 10, up to 12 hours" },
]
const OVER: { key: Key; label: string }[] = [
  { key: "baseOver12h", label: "Base price" },
  { key: "hourlyOver12h", label: "Each extra hour after 12 hours" },
]
const KEYS: Key[] = [...PACKAGES, ...OVER].map((f) => f.key)
const EMPTY = Object.fromEntries(KEYS.map((k) => [k, ""])) as Record<Key, string>

export function CarPricingDialog({ car }: { car: Car }) {
  const [open, setOpen] = React.useState(false)
  const [v, setV] = React.useState(EMPTY)
  const [loaded, setLoaded] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")

  async function load() {
    setLoaded(false)
    setError("")
    const r = await getRatesAction(car.id)
    if (!r.ok) return void setError(r.error)
    setV(Object.fromEntries(KEYS.map((k) => [k, r.data?.[k] == null ? "" : String(r.data[k])])) as Record<Key, string>)
    setLoaded(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const bad = KEYS.find((k) => v[k].trim() !== "" && !(Number.isInteger(Number(v[k])) && Number(v[k]) >= 0))
    if (bad) return void setError("Prices are whole rupees (0 or more). Leave a box empty for “on request”.")
    const rates = Object.fromEntries(KEYS.map((k) => [k, v[k].trim() === "" ? null : Number(v[k])]))
    setBusy(true)
    const r = await saveRatesAction(car.id, rates)
    setBusy(false)
    if (!r.ok) return void setError(r.error)
    toast.success(`Pricing saved for ${car.name}`)
    setOpen(false)
  }

  const box = (k: Key, label: string, hint?: string) => (
    <Field key={k}>
      <FieldLabel htmlFor={`${car.id}-${k}`}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>LKR</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          id={`${car.id}-${k}`}
          type="number"
          inputMode="numeric"
          min={0}
          step={500}
          placeholder="On request"
          value={v[k]}
          onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))}
          disabled={!loaded || busy}
        />
      </InputGroup>
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  )

  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o && void load())}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="rounded-full">
          <TagIcon data-icon="inline-start" />
          Pricing
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Pricing · {car.name} ({car.color})
          </DialogTitle>
          <DialogDescription>
            This car&apos;s price by hire duration. New bookings fill in the customer&apos;s hire amount from it, and hire partners
            see it on the Hire Partner Inquiry page. Leave a box empty if there&apos;s no set price for that duration.
          </DialogDescription>
        </DialogHeader>
        {!loaded && !error ? (
          <div className="grid gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : (
          <form id={`pricing-${car.id}`} onSubmit={save} className="grid gap-5">
            <section className="grid gap-3 sm:grid-cols-2">{PACKAGES.map((f) => box(f.key, f.label, f.hint))}</section>
            <section className="grid gap-3 rounded-xl bg-muted/50 p-3">
              <div>
                <h3 className="text-sm font-medium">Above 12 hours</h3>
                <p className="text-xs text-muted-foreground">Base price plus each started extra hour. Set both or leave both empty.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">{OVER.map((f) => box(f.key, f.label))}</div>
            </section>
            {error && <FieldError>{error}</FieldError>}
          </form>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={`pricing-${car.id}`} disabled={!loaded || busy}>
            {busy ? "Saving…" : "Save pricing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
