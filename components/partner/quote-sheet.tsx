import Image from "next/image"

import { fmtDate, rs } from "@/lib/bridal/format"
import { commissionLabel, fmtDuration, type Quote } from "@/lib/partner/pricing"
import { cn } from "@/lib/utils"

// The estimated quotation for a partner inquiry, on screen (the PDF in
// lib/partner/quote-pdf.ts has the same content). It is a quotation, never a
// confirmed booking or a tax invoice, and says so.

export type QuoteDoc = {
  quote: Quote
  // "draft" before submitting; otherwise the inquiry's status.
  status: "draft" | "pending" | "approved" | "rejected"
  inquiryId?: string
  createdAt?: string
  company: string
  contactName: string
  email: string
  phone: string
  carName: string
  hireDate: string
  pickupTime: string
  dropTime: string
  pickupLoc: string
  dropLoc: string
  stops: string[]
}

export const fmtT = (t: string) => {
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
}
export const lkr = (n: number) => rs(n).replace(/^Rs\s?/, "LKR ")

export const STATUS_LABEL: Record<QuoteDoc["status"], string> = {
  draft: "Draft estimate",
  pending: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
}

function Row({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5", strong && "text-base font-semibold")}>
      <span className={cn(!strong && "text-muted-foreground")}>{label}</span>
      <span className={cn("text-right tabular-nums", accent && "font-semibold text-emerald-700")}>{value}</span>
    </div>
  )
}

export function QuoteSheet({ doc }: { doc: QuoteDoc }) {
  const q = doc.quote
  return (
    <article className="grid gap-5 rounded-2xl border bg-white p-5 text-sm text-[#2a1d10] sm:p-7">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Chrish Rentals logo" width={56} height={56} className="size-14" />
          <div>
            <p className="text-base font-semibold">Chrish Rentals</p>
            <p className="text-xs text-muted-foreground">070 107 1777 · www.chrishrentals.com</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold tracking-[0.2em] text-[#9a7445] uppercase">Estimated quotation</p>
          <p className="font-mono text-sm">{q.quoteNo}</p>
          {doc.inquiryId && <p className="text-xs text-muted-foreground">Inquiry {doc.inquiryId}</p>}
          <p className="text-xs text-muted-foreground">{fmtDate((doc.createdAt ?? q.calculatedAt).slice(0, 10))}</p>
          <span
            className={cn(
              "mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium",
              doc.status === "approved" ? "bg-emerald-100 text-emerald-800" : doc.status === "rejected" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900"
            )}
          >
            {STATUS_LABEL[doc.status]}
          </span>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <section>
          <h4 className="mb-1 text-xs font-semibold tracking-[0.15em] text-muted-foreground uppercase">Hire company</h4>
          <p className="font-medium">{doc.company}</p>
          <p>{doc.contactName}</p>
          <p className="text-muted-foreground">{doc.email}</p>
          <p className="text-muted-foreground">{doc.phone}</p>
        </section>
        <section>
          <h4 className="mb-1 text-xs font-semibold tracking-[0.15em] text-muted-foreground uppercase">Vehicle &amp; time</h4>
          <p className="font-medium">{doc.carName}</p>
          <p>{fmtDate(doc.hireDate)}</p>
          <p>
            {fmtT(doc.pickupTime)} – {fmtT(doc.dropTime)} · {fmtDuration(q.durationMinutes)}
          </p>
        </section>
      </div>

      <section>
        <h4 className="mb-1 text-xs font-semibold tracking-[0.15em] text-muted-foreground uppercase">Route</h4>
        <ol className="grid gap-0.5">
          <li>
            <span className="text-muted-foreground">Pick-up:</span> {doc.pickupLoc}
          </li>
          {doc.stops.map((s, i) => (
            <li key={i}>
              <span className="text-muted-foreground">Stop {i + 1}:</span> {s}
            </li>
          ))}
          <li>
            <span className="text-muted-foreground">Drop-off:</span> {doc.dropLoc}
          </li>
        </ol>
      </section>

      <section className="rounded-xl bg-[#faf6ef] p-4">
        <Row label={`Vehicle hire charge — ${q.tierLabel}`} value={lkr(q.hireCharge)} />
        {q.extraHours > 0 && <Row label={`Additional charges — ${q.extraHours} extra hour${q.extraHours === 1 ? "" : "s"} × ${lkr(q.extraHourly)}`} value={lkr(q.extraCharge)} />}
        {q.extraHours === 0 && <Row label="Additional charges" value={lkr(0)} />}
        <div className="my-1 border-t" />
        <Row label="Total estimated hire amount" value={lkr(q.total)} strong />
        <Row label={`Partner commission (${commissionLabel(q)})`} value={`− ${lkr(q.commission)}`} />
        <div className="my-1 border-t" />
        <Row label="Net payable to Chrish Rentals" value={lkr(q.net)} strong accent />
      </section>

      <p className="rounded-lg border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">
        This is an <strong>estimated quotation</strong> only — it is <strong>not a confirmed booking</strong> and{" "}
        <strong>not a tax invoice</strong>. The vehicle is reserved only after Chrish Rentals approves the inquiry and confirms by email.
        Prices are in Sri Lankan rupees.
      </p>
    </article>
  )
}

// An inquiry as a quotation document.
export const docOfInquiry = (i: {
  quote: Quote
  status: "pending" | "approved" | "rejected"
  id: string
  createdAt: string
  company: string
  contactName: string
  email: string
  phone: string
  carName: string
  hireDate: string
  pickupTime: string
  dropTime: string
  pickupLoc: string
  dropLoc: string
  stops: string[]
}): QuoteDoc => ({
  quote: i.quote,
  status: i.status,
  inquiryId: i.id,
  createdAt: i.createdAt,
  company: i.company,
  contactName: i.contactName,
  email: i.email,
  phone: i.phone,
  carName: i.carName,
  hireDate: i.hireDate,
  pickupTime: i.pickupTime,
  dropTime: i.dropTime,
  pickupLoc: i.pickupLoc,
  dropLoc: i.dropLoc,
  stops: i.stops,
})

export function StatusBadge({ status }: { status: "pending" | "approved" | "rejected" }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        status === "approved" ? "bg-emerald-100 text-emerald-800" : status === "rejected" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900"
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}
