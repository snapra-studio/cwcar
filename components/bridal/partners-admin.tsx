"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  BanknoteIcon,
  CheckIcon,
  DownloadIcon,
  EyeIcon,
  MailIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { ConfirmAction } from "@/components/bridal/confirm-action"
import { QuoteSheet, StatusBadge, docOfInquiry, fmtT, lkr } from "@/components/partner/quote-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { fmtDate } from "@/lib/bridal/format"
import { reloadBridal } from "@/lib/bridal/store"
import { fmtDuration, type PartnerRates } from "@/lib/partner/pricing"
import {
  approveInquiryAction,
  rejectInquiryAction,
  removeOverrideAction,
  resendDecisionEmailAction,
  saveCommissionSettingsAction,
  saveRatesAction,
  setOverrideAction,
} from "@/lib/server/partner-admin-actions"
import type { CommissionChange, CommissionOverride, CommissionSettings, InquiryView, RatedCar } from "@/lib/server/partners"
import { cn } from "@/lib/utils"

type Commission = {
  settings: CommissionSettings
  overrides: CommissionOverride[]
  history: CommissionChange[]
  summary: { approved: number; total: number; commission: number; net: number }
} | null

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : ""

export function PartnersAdmin({
  tab,
  inquiries,
  rates,
  commission,
}: {
  tab?: string
  inquiries: InquiryView[]
  rates: RatedCar[]
  commission: Commission
}) {
  const pending = inquiries.filter((i) => i.status === "pending").length
  return (
    <Tabs defaultValue={tab && ["inquiries", "pricing", "commission"].includes(tab) ? tab : "inquiries"} className="grid gap-4">
      <TabsList className="h-auto w-fit flex-wrap">
        <TabsTrigger value="inquiries">Inquiries{pending ? ` (${pending} pending)` : ""}</TabsTrigger>
        <TabsTrigger value="pricing">Partner Vehicle Pricing</TabsTrigger>
        {commission && <TabsTrigger value="commission">Commission Settings</TabsTrigger>}
      </TabsList>
      <TabsContent value="inquiries">
        <Inquiries inquiries={inquiries} />
      </TabsContent>
      <TabsContent value="pricing">
        <Pricing rates={rates} />
      </TabsContent>
      {commission && (
        <TabsContent value="commission">
          <CommissionPanel data={commission} inquiries={inquiries} cars={rates} />
        </TabsContent>
      )}
    </Tabs>
  )
}

// ---------------------------------------------------------------------------
// Inquiries
// ---------------------------------------------------------------------------

function Inquiries({ inquiries }: { inquiries: InquiryView[] }) {
  const [query, setQuery] = React.useState("")
  const [status, setStatus] = React.useState("")
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")
  const [openId, setOpenId] = React.useState<string | null>(null)
  const q = query.trim().toLowerCase()
  const shown = inquiries.filter(
    (i) =>
      (!status || i.status === status) &&
      (!from || i.hireDate >= from) &&
      (!to || i.hireDate <= to) &&
      (!q || [i.id, i.company, i.contactName, i.email, i.phone, i.carName].some((v) => v.toLowerCase().includes(q)))
  )
  const open = inquiries.find((i) => i.id === openId) ?? null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Partner inquiries</CardTitle>
        <CardDescription>Hire requests from other rental companies and agents. Pending inquiries don&apos;t block the calendar.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex h-9 min-w-56 flex-1 items-center gap-2 rounded-lg border px-3">
            <SearchIcon className="size-4 text-muted-foreground" />
            <input
              aria-label="Search inquiries"
              placeholder="Search ID, company, name, email, phone, vehicle…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <NativeSelect aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <NativeSelectOption value="">All statuses</NativeSelectOption>
            <NativeSelectOption value="pending">Pending approval</NativeSelectOption>
            <NativeSelectOption value="approved">Approved</NativeSelectOption>
            <NativeSelectOption value="rejected">Rejected</NativeSelectOption>
          </NativeSelect>
          <Input aria-label="Hire date from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
          <Input aria-label="Hire date to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
        </div>
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Inquiry</TableHead>
                <TableHead>Company / contact</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Hire date &amp; time</TableHead>
                <TableHead className="text-right">Estimated total</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead className="text-right">Net payable</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    {inquiries.length ? "No inquiries match." : "No partner inquiries yet."}
                  </TableCell>
                </TableRow>
              ) : (
                shown.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <div className="font-mono text-xs">{i.id}</div>
                      <div className="text-xs text-muted-foreground">{when(i.createdAt)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{i.company}</div>
                      <div className="text-xs text-muted-foreground">
                        {i.contactName} · {i.email} · {i.phone}
                      </div>
                    </TableCell>
                    <TableCell>{i.carName}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {fmtDate(i.hireDate)}
                      <div className="text-xs text-muted-foreground">
                        {fmtT(i.pickupTime)} – {fmtT(i.dropTime)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{lkr(i.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{lkr(i.commission)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{lkr(i.net)}</TableCell>
                    <TableCell>
                      <StatusBadge status={i.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setOpenId(i.id)}>
                        <EyeIcon data-icon="inline-start" />
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <InquiryDetails inquiry={open} onClose={() => setOpenId(null)} />
    </Card>
  )
}

function InquiryDetails({ inquiry: i, onClose }: { inquiry: InquiryView | null; onClose: () => void }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [rejecting, setRejecting] = React.useState(false)
  const [reason, setReason] = React.useState("")
  const [error, setError] = React.useState("")

  async function approve() {
    if (!i) return
    setBusy(true)
    setError("")
    const r = await approveInquiryAction(i.id)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    toast.success(`Approved — booking created${r.data.emailed ? " and email sent" : ". The email couldn't be sent (see details)"}`)
    void reloadBridal()
    router.refresh()
  }

  async function reject() {
    if (!i) return
    setBusy(true)
    setError("")
    const r = await rejectInquiryAction(i.id, reason)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setRejecting(false)
    setReason("")
    toast.success(`Inquiry rejected${r.data.emailed ? " — email sent" : ". The email couldn't be sent (see details)"}`)
    router.refresh()
  }

  async function resend() {
    if (!i) return
    setBusy(true)
    const r = await resendDecisionEmailAction(i.id)
    setBusy(false)
    if (!r.ok) return void toast.error(r.error)
    toast[r.data ? "success" : "error"](r.data ? "Email sent" : "The email still couldn't be sent")
    router.refresh()
  }

  return (
    <>
      <Dialog open={!!i && !rejecting} onOpenChange={(o) => !o && !busy && (setError(""), onClose())}>
        <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              Inquiry {i?.id} {i && <StatusBadge status={i.status} />}
            </DialogTitle>
            <DialogDescription>Submitted {when(i?.createdAt)}</DialogDescription>
          </DialogHeader>
          {i && (
            <div className="grid gap-4 text-sm">
              <div className="grid gap-1 rounded-xl border p-3 sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">WhatsApp:</span> {i.whatsapp || "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Duration:</span> {fmtDuration(i.durationMinutes)}
                </p>
                <p className="sm:col-span-2">
                  <span className="text-muted-foreground">Special requirements:</span> {i.notes || "—"}
                </p>
              </div>
              {i.status === "approved" && (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
                  Approved {when(i.decidedAt)} by {i.decidedBy}. Booking{" "}
                  {i.bookingId ? (
                    <Link className="font-medium underline" href={`/admin/dashboard/bookings/${i.bookingId}/edit`}>
                      {i.bookingInvNo ?? "open"}
                    </Link>
                  ) : (
                    "—"
                  )}{" "}
                  is on the calendar.
                </p>
              )}
              {i.status === "rejected" && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-900">
                  Rejected {when(i.decidedAt)} by {i.decidedBy}. Reason: {i.rejectionReason || "not given"}
                </p>
              )}
              {i.status !== "pending" && (
                <p className="flex flex-wrap items-center gap-2">
                  <MailIcon className="size-4" />
                  Email to {i.email}:{" "}
                  <strong className={cn(i.emailStatus === "sent" ? "text-emerald-700" : i.emailStatus === "failed" ? "text-rose-700" : "")}>
                    {i.emailStatus === "sent" ? `sent ${when(i.emailSentAt)}` : i.emailStatus === "failed" ? `failed (${i.emailError})` : i.emailStatus}
                  </strong>
                  {i.emailAttempts > 0 && <span className="text-muted-foreground">· {i.emailAttempts} attempt(s)</span>}
                  <Button size="sm" variant="outline" onClick={resend} disabled={busy}>
                    {i.emailStatus === "sent" ? "Send again" : "Retry email"}
                  </Button>
                </p>
              )}
              <QuoteSheet doc={docOfInquiry(i)} />
              {error && (
                <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-900">
                  {error}
                </p>
              )}
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            {i && (
              <Button variant="outline" onClick={async () => (await import("@/lib/partner/quote-pdf")).downloadQuotePdf(docOfInquiry(i))}>
                <DownloadIcon data-icon="inline-start" />
                Download PDF
              </Button>
            )}
            {i?.status === "pending" && (
              <>
                <Button variant="destructive" onClick={() => setRejecting(true)} disabled={busy}>
                  <XIcon data-icon="inline-start" />
                  Reject Inquiry
                </Button>
                <Button onClick={approve} disabled={busy}>
                  <CheckIcon data-icon="inline-start" />
                  {busy ? "Approving…" : "Approve Inquiry"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejecting} onOpenChange={(o) => !o && !busy && setRejecting(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject inquiry {i?.id}?</DialogTitle>
            <DialogDescription>No booking is made and the calendar isn&apos;t changed. {i?.contactName} gets an email with the reason.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="rej-reason">Reason (optional)</FieldLabel>
            <Textarea id="rej-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The vehicle is reserved for a family event that day." />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={reject} disabled={busy}>
              {busy ? "Rejecting…" : "Reject Inquiry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// Partner vehicle pricing
// ---------------------------------------------------------------------------

const RATE_FIELDS: { key: keyof PartnerRates; label: string; hint: string }[] = [
  { key: "rate4h", label: "Up to 4 h", hint: "package" },
  { key: "rate8h", label: "4 – 8 h", hint: "package" },
  { key: "rate12h", label: "8 – 12 h", hint: "package" },
  { key: "baseOver12h", label: "Above 12 h: base", hint: "base rate" },
  { key: "hourlyOver12h", label: "+ per extra hour", hint: "after 12 h" },
]

function Pricing({ rates }: { rates: RatedCar[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Partner Vehicle Pricing</CardTitle>
        <CardDescription>
          B2B prices for hire partners, per car — separate from the customer day rate. Above 12 hours = base rate + each started
          extra hour × the hourly charge. Leave a box empty if you don&apos;t offer that package (partners will be asked to call).
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {rates.map((c) => (
          <RateRow key={c.carId} car={c} />
        ))}
        {rates.length === 0 && <p className="text-muted-foreground">No own cars yet.</p>}
      </CardContent>
    </Card>
  )
}

function RateRow({ car }: { car: RatedCar }) {
  const router = useRouter()
  const init = () => Object.fromEntries(RATE_FIELDS.map((f) => [f.key, car.rates[f.key] == null ? "" : String(car.rates[f.key])])) as Record<keyof PartnerRates, string>
  const [v, setV] = React.useState(init)
  const [busy, setBusy] = React.useState(false)
  const dirty = RATE_FIELDS.some((f) => v[f.key] !== (car.rates[f.key] == null ? "" : String(car.rates[f.key])))

  async function save() {
    const rates = Object.fromEntries(RATE_FIELDS.map((f) => [f.key, v[f.key].trim() === "" ? null : Number(v[f.key])]))
    if (Object.values(rates).some((n) => n != null && (!Number.isInteger(n) || n < 0))) return void toast.error("Use whole rupees, 0 or more.")
    setBusy(true)
    const r = await saveRatesAction(car.carId, rates)
    setBusy(false)
    if (!r.ok) return void toast.error(r.error)
    toast.success(`Partner prices saved for ${car.name} (${car.color})`)
    router.refresh()
  }

  return (
    <div className="grid gap-3 rounded-xl border p-3 lg:grid-cols-[14rem_repeat(5,minmax(0,1fr))_auto] lg:items-end">
      <div>
        <div className="font-medium">{car.name}</div>
        <div className="text-sm text-muted-foreground capitalize">
          {car.color}
          {car.updatedAt ? ` · updated ${when(car.updatedAt)}` : " · not set"}
        </div>
      </div>
      {RATE_FIELDS.map((f) => (
        <Field key={f.key}>
          <FieldLabel htmlFor={`${car.carId}-${f.key}`} className="text-xs">
            {f.label} (LKR)
          </FieldLabel>
          <Input
            id={`${car.carId}-${f.key}`}
            type="number"
            min={0}
            step={500}
            inputMode="numeric"
            placeholder="—"
            value={v[f.key]}
            onChange={(e) => setV((x) => ({ ...x, [f.key]: e.target.value }))}
          />
        </Field>
      ))}
      <Button onClick={save} disabled={busy || !dirty}>
        {busy ? "Saving…" : "Save"}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Commission (super admin)
// ---------------------------------------------------------------------------

function CommissionPanel({ data, inquiries, cars }: { data: NonNullable<Commission>; inquiries: InquiryView[]; cars: RatedCar[] }) {
  // Partners who have sent inquiries, by email (latest company name).
  const known = [...new Map(inquiries.map((i) => [i.email.toLowerCase(), i.company])).entries()]
  const router = useRouter()
  const [enabled, setEnabled] = React.useState(data.settings.enabled)
  const [amt, setAmt] = React.useState(String(data.settings.defaultAmount))
  const [kind, setKind] = React.useState<"partner" | "vehicle">("partner")
  const [target, setTarget] = React.useState("")
  const [oamt, setOamt] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function saveDefault() {
    const n = Number(amt)
    if (amt.trim() === "" || !Number.isInteger(n) || n < 0) return void toast.error("Enter the commission in whole rupees (0 or more).")
    setBusy(true)
    const r = await saveCommissionSettingsAction({ enabled, defaultAmount: n })
    setBusy(false)
    if (!r.ok) return void toast.error(r.error)
    toast.success("Commission settings saved — they apply to new inquiries")
    router.refresh()
  }

  async function addOverride() {
    const n = Number(oamt)
    if (!target.trim()) return void toast.error(kind === "partner" ? "Enter the partner's email address." : "Choose a vehicle.")
    if (oamt.trim() === "" || !Number.isInteger(n) || n < 0) return void toast.error("Enter the commission in whole rupees (0 or more).")
    setBusy(true)
    const r = await setOverrideAction({ kind, targetId: target, amount: n })
    setBusy(false)
    if (!r.ok) return void toast.error(r.error)
    setTarget("")
    setOamt("")
    toast.success("Special commission rate saved")
    router.refresh()
  }

  const example = 35000
  const exCom = enabled ? Math.min(example, Math.max(0, Math.round(Number(amt) || 0))) : 0

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BanknoteIcon className="size-5 text-primary" />
            Default partner commission
          </CardTitle>
          <CardDescription>
            A fixed amount per approved hire, whatever the hire total. Applies to new inquiries; submitted quotations keep the amount they
            were made with.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field orientation="horizontal">
            <Switch id="com-on" checked={enabled} onCheckedChange={setEnabled} />
            <FieldLabel htmlFor="com-on">Pay commission to hire partners</FieldLabel>
          </Field>
          <Field>
            <FieldLabel htmlFor="com-amt">Default commission per hire (LKR)</FieldLabel>
            <Input
              id="com-amt"
              type="number"
              inputMode="numeric"
              min={0}
              step={500}
              placeholder="e.g. 4000"
              value={amt}
              onChange={(e) => setAmt(e.target.value)}
              className="w-48"
              disabled={!enabled}
            />
            <FieldDescription>
              Example: hire {lkr(example)} − commission {lkr(exCom)} = net to Chrish Rentals {lkr(example - exCom)}.
            </FieldDescription>
          </Field>
          <Button className="w-fit" onClick={saveDefault} disabled={busy}>
            Save
          </Button>
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/40 p-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground uppercase">Approved hires</div>
              <div className="font-semibold">{data.summary.approved}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase">Commission paid</div>
              <div className="font-semibold">{lkr(data.summary.commission)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase">Net to us</div>
              <div className="font-semibold">{lkr(data.summary.net)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Special rates</CardTitle>
          <CardDescription>
            A different fixed amount (LKR) for a partner (by the email address they use on inquiries) or for a vehicle. A partner&apos;s rate wins
            over a vehicle&apos;s; otherwise the default applies.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-end gap-2">
            <NativeSelect aria-label="For" value={kind} onChange={(e) => (setKind(e.target.value as "partner" | "vehicle"), setTarget(""))}>
              <NativeSelectOption value="partner">Partner</NativeSelectOption>
              <NativeSelectOption value="vehicle">Vehicle</NativeSelectOption>
            </NativeSelect>
            {kind === "partner" ? (
              <>
                <Input
                  aria-label="Partner email"
                  type="email"
                  list="partner-emails"
                  placeholder="partner@company.com"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="min-w-56 flex-1"
                />
                <datalist id="partner-emails">
                  {known.map(([email, company]) => (
                    <option key={email} value={email}>
                      {company}
                    </option>
                  ))}
                </datalist>
              </>
            ) : (
              <NativeSelect aria-label="Vehicle" value={target} onChange={(e) => setTarget(e.target.value)} className="min-w-48">
                <NativeSelectOption value="">Choose…</NativeSelectOption>
                {cars.map((c) => (
                  <NativeSelectOption key={c.carId} value={c.carId}>
                    {c.name} ({c.color})
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
            <Input
              aria-label="Amount (LKR)"
              type="number"
              inputMode="numeric"
              min={0}
              step={500}
              placeholder="LKR"
              value={oamt}
              onChange={(e) => setOamt(e.target.value)}
              className="w-32"
            />
            <Button onClick={addOverride} disabled={busy}>
              Save rate
            </Button>
          </div>
          {data.overrides.length === 0 ? (
            <p className="text-sm text-muted-foreground">No special rates — everyone gets the default.</p>
          ) : (
            <ul className="grid gap-1.5">
              {data.overrides.map((o) => (
                <li key={o.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <Badge variant="secondary">{o.kind === "partner" ? "Partner" : "Vehicle"}</Badge>
                  <span className="flex-1">{o.targetName}</span>
                  <strong>{lkr(o.amount)}</strong>
                  <ConfirmAction
                    trigger={
                      <Button size="sm" variant="ghost">
                        Remove
                      </Button>
                    }
                    title={`Remove the special rate for ${o.targetName}?`}
                    description="New inquiries will use the default commission instead."
                    confirmLabel="Remove"
                    onConfirm={async () => {
                      const r = await removeOverrideAction(o.id)
                      if (!r.ok) return void toast.error(r.error)
                      router.refresh()
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg">Commission history</CardTitle>
          <CardDescription>Every change to commission settings.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No changes yet.</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {data.history.map((h, k) => (
                <li key={k} className="flex flex-wrap gap-x-3 border-b py-1.5 last:border-0">
                  <span className="text-muted-foreground tabular-nums">{when(h.at)}</span>
                  <span className="flex-1">{h.change}</span>
                  <span className="text-muted-foreground">{h.actor}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
