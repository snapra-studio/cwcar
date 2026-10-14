"use client"

import * as React from "react"
import {
  CalculatorIcon,
  CheckCircle2Icon,
  ClockIcon,
  DownloadIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  Trash2Icon,
  XCircleIcon,
} from "lucide-react"

import { CarPhoto } from "@/components/bridal/car-art"
import { QuoteSheet, fmtT, type QuoteDoc } from "@/components/partner/quote-sheet"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { fmtDate } from "@/lib/bridal/format"
import type { CarStyle } from "@/lib/bridal/types"
import { durationMinutes, fmtDuration, type Quote } from "@/lib/partner/pricing"
import { checkFleetAction, estimateAction, submitInquiryAction } from "@/lib/server/partner-public-actions"
import type { PartnerFleetCar } from "@/lib/server/partners"
import { cn } from "@/lib/utils"

// Hire partner inquiry flow: choose date and pick-up / drop-off times →
// see every car in our fleet as Available or Booked → "Inquiry" on an
// available car → fill in details → "Calculate Estimated Bill" → Edit,
// Download PDF or Submit. Prices and commission come from the server.

const STYLE: Record<string, string> = { sedan: "Sedan", vintage: "Vintage", suv: "SUV" }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const phoneOk = (v: string) => /^[+\d][\d\s()-]{6,}$/.test(v.trim()) && v.replace(/\D/g, "").length >= 9

type Form = {
  company: string
  contactName: string
  email: string
  phone: string
  whatsapp: string
  pickupLoc: string
  dropLoc: string
  stops: string[]
  notes: string
}
const EMPTY: Form = { company: "", contactName: "", email: "", phone: "", whatsapp: "", pickupLoc: "", dropLoc: "", stops: [], notes: "" }

function validate(f: Form) {
  const e: Partial<Record<keyof Form, string>> = {}
  if (f.company.trim().length < 2) e.company = "Enter your hire company name"
  if (f.contactName.trim().length < 2) e.contactName = "Enter your full name"
  if (!EMAIL.test(f.email.trim())) e.email = "Enter a valid email address"
  if (!phoneOk(f.phone)) e.phone = "Enter a valid contact number"
  if (f.whatsapp.trim() && !phoneOk(f.whatsapp)) e.whatsapp = "Enter a valid WhatsApp number, or leave it empty"
  if (f.pickupLoc.trim().length < 2) e.pickupLoc = "Enter the pick-up location"
  if (f.dropLoc.trim().length < 2) e.dropLoc = "Enter the drop-off location"
  return e
}

export function InquiryWorkspace({ today, afterForm }: { today: string; afterForm?: React.ReactNode }) {
  const [date, setDate] = React.useState("")
  const [pickup, setPickup] = React.useState("")
  const [drop, setDrop] = React.useState("")
  const [fleet, setFleet] = React.useState<PartnerFleetCar[] | null>(null)
  const [checked, setChecked] = React.useState<{ date: string; pickup: string; drop: string } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")

  const [car, setCar] = React.useState<PartnerFleetCar | null>(null)
  const [form, setForm] = React.useState<Form>(EMPTY)
  const [errors, setErrors] = React.useState<Partial<Record<keyof Form, string>>>({})
  const [serverError, setServerError] = React.useState("")
  const [quote, setQuote] = React.useState<Quote | null>(null)
  const [submitted, setSubmitted] = React.useState<QuoteDoc | null>(null)
  const [working, setWorking] = React.useState(false)

  const minutes = durationMinutes(pickup, drop)
  const windowOk = !!date && !!pickup && !!drop && minutes > 0

  async function check(e?: React.FormEvent) {
    e?.preventDefault()
    setError("")
    if (!date || !pickup || !drop) return setError("Choose the hire date, pick-up time and drop-off time.")
    if (!(minutes > 0)) return setError("The drop-off time must be later than the pick-up time on the same day.")
    setBusy(true)
    const r = await checkFleetAction({ date, pickupTime: pickup, dropTime: drop })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setFleet(r.data)
    setChecked({ date, pickup, drop })
  }

  // Changing the date/time hides the old results until checked again.
  const stale = !!checked && (checked.date !== date || checked.pickup !== pickup || checked.drop !== drop)

  function openInquiry(c: PartnerFleetCar) {
    setCar(c)
    setErrors({})
    setServerError("")
    setQuote(null)
  }

  const payload = () =>
    car && checked
      ? {
          carId: car.carId,
          hireDate: checked.date,
          pickupTime: checked.pickup,
          dropTime: checked.drop,
          ...form,
          stops: form.stops.map((s) => s.trim()).filter(Boolean),
        }
      : null

  async function estimate() {
    const e = validate(form)
    setErrors(e)
    setServerError("")
    if (Object.keys(e).length) return
    setWorking(true)
    const r = await estimateAction(payload())
    setWorking(false)
    if (!r.ok) return setServerError(r.error)
    setQuote(r.data)
  }

  async function submit() {
    setWorking(true)
    const r = await submitInquiryAction(payload())
    setWorking(false)
    if (!r.ok) {
      setQuote(null)
      return setServerError(r.error)
    }
    const i = r.data
    setSubmitted({ ...docOf(), quote: i.quote, status: "pending", inquiryId: i.id, createdAt: i.createdAt })
    setQuote(null)
    setCar(null)
    // Keep the company and contact details for their next inquiry.
    setForm((f) => ({ ...f, pickupLoc: "", dropLoc: "", stops: [], notes: "" }))
    void check()
  }

  const docOf = (): QuoteDoc => ({
    quote: quote!,
    status: "draft",
    company: form.company.trim(),
    contactName: form.contactName.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    carName: car ? `${car.name} (${car.color})` : "",
    hireDate: checked?.date ?? "",
    pickupTime: checked?.pickup ?? "",
    dropTime: checked?.drop ?? "",
    pickupLoc: form.pickupLoc.trim(),
    dropLoc: form.dropLoc.trim(),
    stops: form.stops.map((s) => s.trim()).filter(Boolean),
  })

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const fieldErr = (k: keyof Form) => errors[k] && <FieldError>{errors[k]}</FieldError>

  return (
    <div className="grid gap-8">
      {/* Step 1: date and times */}
      <form onSubmit={check} noValidate className="grid gap-4 rounded-[1.75rem] border border-black/[0.06] bg-white p-5 shadow-[0_30px_80px_-40px_rgba(60,40,20,0.25)] sm:p-7">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <Field>
            <FieldLabel htmlFor="pi-date">Hire date</FieldLabel>
            <Input id="pi-date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
          </Field>
          <Field>
            <FieldLabel htmlFor="pi-pickup">Pick-up time</FieldLabel>
            <Input id="pi-pickup" type="time" value={pickup} onChange={(e) => setPickup(e.target.value)} className="h-11" />
          </Field>
          <Field>
            <FieldLabel htmlFor="pi-drop">Drop-off time</FieldLabel>
            <Input id="pi-drop" type="time" value={drop} onChange={(e) => setDrop(e.target.value)} className="h-11" />
          </Field>
          <Button type="submit" size="lg" className="h-11 rounded-full px-6" disabled={busy}>
            <SearchIcon data-icon="inline-start" />
            {busy ? "Checking…" : "Check fleet availability"}
          </Button>
        </div>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <ClockIcon className="size-4" aria-hidden />
          {windowOk ? `Hire duration: ${fmtDuration(minutes)} (same-day hire)` : "Pick-up and drop-off are on the same day."}
        </p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>

      {afterForm}

      {/* Step 2: the fleet */}
      {fleet && checked && (
        <section aria-labelledby="pi-fleet" className={cn("grid gap-4 transition-opacity", stale && "opacity-50")}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="pi-fleet" className="text-xl font-semibold">
              Our fleet on {fmtDate(checked.date)}, {fmtT(checked.pickup)} – {fmtT(checked.drop)}
            </h2>
            <p className="text-sm text-muted-foreground">
              {fleet.filter((c) => c.available).length} of {fleet.length} available
              {stale && " · times changed — check again"}
            </p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fleet.map((c) => (
              <li key={c.carId} className="overflow-hidden rounded-3xl border border-black/[0.07] bg-white">
                <div className="relative">
                  <CarPhoto
                    car={{ name: c.name, hex: "#999999", style: c.style as CarStyle, image: c.image }}
                    alt={`${c.color} ${c.name} for partner hire`}
                    shade={false}
                    className="aspect-[16/10]"
                    sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw"
                  />
                  <span
                    className={cn(
                      "absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shadow-sm",
                      c.available ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
                    )}
                  >
                    {c.available ? <CheckCircle2Icon className="size-3.5" aria-hidden /> : <XCircleIcon className="size-3.5" aria-hidden />}
                    {c.available ? "Available" : "Booked"}
                  </span>
                </div>
                <div className="flex items-end justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-medium">{c.name}</h3>
                    <p className="text-sm text-muted-foreground capitalize">
                      {c.color} · {STYLE[c.style] ?? c.style}
                    </p>
                    {c.available && !c.priced && <p className="text-xs text-amber-700">Partner rate for this duration on request — please call us.</p>}
                  </div>
                  <Button
                    type="button"
                    className="shrink-0 rounded-full"
                    disabled={!c.available || !c.priced || stale}
                    onClick={() => openInquiry(c)}
                    aria-label={`Inquiry for ${c.color} ${c.name}`}
                  >
                    Inquiry
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Inquiry form */}
      <Dialog open={!!car && !quote} onOpenChange={(o) => !o && !working && setCar(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Hire inquiry</DialogTitle>
            <DialogDescription>Fill in your details, then calculate the estimated bill.</DialogDescription>
          </DialogHeader>
          {car && checked && (
            <div className="grid gap-5">
              <div className="grid gap-1 rounded-xl border bg-muted/40 p-3 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Vehicle:</span> <strong>{car.name} ({car.color})</strong>
                </p>
                <p>
                  <span className="text-muted-foreground">Hire date:</span> <strong>{fmtDate(checked.date)}</strong>
                </p>
                <p>
                  <span className="text-muted-foreground">Pick-up → drop-off:</span>{" "}
                  <strong>
                    {fmtT(checked.pickup)} → {fmtT(checked.drop)}
                  </strong>
                </p>
                <p>
                  <span className="text-muted-foreground">Total duration:</span> <strong>{fmtDuration(durationMinutes(checked.pickup, checked.drop))}</strong>
                </p>
              </div>
              <FieldGroup>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="pi-company">Hire company name *</FieldLabel>
                    <Input id="pi-company" value={form.company} onChange={set("company")} aria-invalid={!!errors.company} />
                    {fieldErr("company")}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="pi-name">Your full name *</FieldLabel>
                    <Input id="pi-name" value={form.contactName} onChange={set("contactName")} aria-invalid={!!errors.contactName} />
                    {fieldErr("contactName")}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="pi-email">Email address *</FieldLabel>
                    <Input id="pi-email" type="email" value={form.email} onChange={set("email")} aria-invalid={!!errors.email} />
                    {fieldErr("email")}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="pi-phone">Contact number *</FieldLabel>
                    <Input id="pi-phone" type="tel" value={form.phone} onChange={set("phone")} aria-invalid={!!errors.phone} />
                    {fieldErr("phone")}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="pi-wa">WhatsApp number (optional)</FieldLabel>
                    <Input id="pi-wa" type="tel" value={form.whatsapp} onChange={set("whatsapp")} aria-invalid={!!errors.whatsapp} />
                    {fieldErr("whatsapp")}
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="pi-from">Pick-up location *</FieldLabel>
                    <Input id="pi-from" value={form.pickupLoc} onChange={set("pickupLoc")} aria-invalid={!!errors.pickupLoc} />
                    {fieldErr("pickupLoc")}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="pi-to">Drop-off location *</FieldLabel>
                    <Input id="pi-to" value={form.dropLoc} onChange={set("dropLoc")} aria-invalid={!!errors.dropLoc} />
                    {fieldErr("dropLoc")}
                  </Field>
                </div>
                <Field>
                  <FieldLabel>Additional stops</FieldLabel>
                  <div className="grid gap-2">
                    {form.stops.map((s, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          aria-label={`Stop ${i + 1}`}
                          placeholder={`Stop ${i + 1}`}
                          value={s}
                          onChange={(e) => setForm((f) => ({ ...f, stops: f.stops.map((x, j) => (j === i ? e.target.value : x)) }))}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Remove stop ${i + 1}`}
                          onClick={() => setForm((f) => ({ ...f, stops: f.stops.filter((_, j) => j !== i) }))}
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    ))}
                    {form.stops.length < 10 && (
                      <Button type="button" variant="outline" size="sm" className="w-fit rounded-full" onClick={() => setForm((f) => ({ ...f, stops: [...f.stops, ""] }))}>
                        <PlusIcon data-icon="inline-start" />
                        Add a stop
                      </Button>
                    )}
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor="pi-notes">Special requirements or notes</FieldLabel>
                  <Textarea id="pi-notes" rows={3} value={form.notes} onChange={set("notes")} maxLength={1000} />
                  <FieldDescription>e.g. decoration colours, number of passengers, photo stops.</FieldDescription>
                </Field>
                {serverError && <FieldError role="alert">{serverError}</FieldError>}
              </FieldGroup>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCar(null)} disabled={working}>
              Cancel
            </Button>
            <Button type="button" onClick={estimate} disabled={working}>
              <CalculatorIcon data-icon="inline-start" />
              {working ? "Calculating…" : "Calculate Estimated Bill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Estimated bill */}
      <Dialog open={!!quote} onOpenChange={(o) => !o && !working && setQuote(null)}>
        <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Estimated bill</DialogTitle>
            <DialogDescription>Check the details, then submit your inquiry for approval.</DialogDescription>
          </DialogHeader>
          {quote && <QuoteSheet doc={docOf()} />}
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          <DialogFooter className="flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setQuote(null)} disabled={working}>
              <PencilIcon data-icon="inline-start" />
              Edit Inquiry
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={working}
              onClick={async () => (await import("@/lib/partner/quote-pdf")).downloadQuotePdf(docOf())}
            >
              <DownloadIcon data-icon="inline-start" />
              Download Estimated Bill PDF
            </Button>
            <Button type="button" onClick={submit} disabled={working}>
              <SendIcon data-icon="inline-start" />
              {working ? "Submitting…" : "Submit Inquiry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submitted */}
      <Dialog open={!!submitted} onOpenChange={(o) => !o && setSubmitted(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2Icon className="size-5 text-emerald-600" />
              Inquiry submitted
            </DialogTitle>
            <DialogDescription>
              Your inquiry <strong className="font-mono">{submitted?.inquiryId}</strong> is <strong>pending approval</strong>. We&apos;ll email{" "}
              {submitted?.email} once Chrish Rentals approves or declines it. The vehicle isn&apos;t reserved until then.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-wrap gap-2">
            {submitted && (
              <Button type="button" variant="outline" onClick={async () => (await import("@/lib/partner/quote-pdf")).downloadQuotePdf(submitted)}>
                <DownloadIcon data-icon="inline-start" />
                Download quotation PDF
              </Button>
            )}
            <Button type="button" onClick={() => setSubmitted(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
