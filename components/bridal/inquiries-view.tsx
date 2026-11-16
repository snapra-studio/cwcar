"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckCircle2Icon, EyeIcon, FileTextIcon, PencilIcon, SearchIcon, SendIcon, XCircleIcon } from "lucide-react"
import { toast } from "sonner"

import { useInvoicePreview } from "@/components/bridal/invoice-preview"
import { ReasonDialog } from "@/components/bridal/reason-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FRESH_FLOWER_COST, fmtDate, rs } from "@/lib/bridal/format"
import {
  DISPLAY_LABEL,
  DISPLAY_TONE,
  EVENT_LABEL,
  REJECT_REASONS,
  STEP_LABEL,
  quotationAsBooking,
  type BookingEvent,
  type InquiryDisplay,
  type InquiryView,
  type QuotationVersion,
} from "@/lib/bridal/inquiry"
import { bookingMoney, reloadBridal, useBridal } from "@/lib/bridal/store"
import {
  convertInquiryAction,
  generateQuotationAction,
  getInquiryAction,
  markSentAction,
  rejectInquiryAction,
} from "@/lib/server/inquiry-actions"
import { cn } from "@/lib/utils"

// Manage Inquiries: every inquiry by its permanent reference, with its
// quotation(s), what happened to it and what to do next. Managers see the
// inquiries for hire dates in their window and the ones they created.

async function call<T>(p: Promise<{ ok: true; data: T } | { ok: false; error: string }>): Promise<T> {
  const r = await p
  if (!r.ok) throw new Error(r.error)
  return r.data
}

const OPEN: InquiryDisplay[] = ["pending_quotation", "quotation_ready", "awaiting_confirmation", "expired"]
const vehiclesOf = (i: Pick<InquiryView, "input">) => i.input.cars.map((c) => c.carName).join(", ")
const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""

export function StatusBadge({ status }: { status: InquiryDisplay }) {
  return (
    <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", DISPLAY_TONE[status])}>
      {DISPLAY_LABEL[status]}
    </span>
  )
}

export function InquiriesView({ inquiries, openId, showQuote }: { inquiries: InquiryView[]; openId?: string; showQuote?: boolean }) {
  const [query, setQuery] = React.useState("")
  const [status, setStatus] = React.useState<"open" | "all" | InquiryDisplay>("open")
  const [dateField, setDateField] = React.useState<"created" | "hire">("created")
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")
  const [sort, setSort] = React.useState("created-desc")
  const [open, setOpen] = React.useState<string | null>(openId ?? null)

  const needle = query.trim().toLowerCase()
  const shown = inquiries
    .filter((i) => (status === "open" ? OPEN.includes(i.display) : status === "all" || i.display === status))
    .filter((i) => !needle || `${i.ref} ${i.customer} ${i.phone}`.toLowerCase().includes(needle))
    .filter((i) => {
      const d = dateField === "created" ? i.createdAt.slice(0, 10) : i.hireDate
      return (!from || d >= from) && (!to || d <= to)
    })
    .sort((a, b) => {
      switch (sort) {
        case "created-asc":
          return a.createdAt.localeCompare(b.createdAt)
        case "hire-asc":
          return a.hireDate.localeCompare(b.hireDate)
        case "hire-desc":
          return b.hireDate.localeCompare(a.hireDate)
        case "ref":
          return a.ref.localeCompare(b.ref)
        default:
          return b.createdAt.localeCompare(a.createdAt)
      }
    })

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3">
          <InputGroup className="w-72 max-w-full">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label="Search inquiries"
              placeholder="Reference, customer or phone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </InputGroup>
          <Field className="w-auto">
            <FieldLabel htmlFor="inqStatus">Status</FieldLabel>
            <NativeSelect id="inqStatus" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <NativeSelectOption value="open">Open inquiries</NativeSelectOption>
              <NativeSelectOption value="all">All</NativeSelectOption>
              {(Object.keys(DISPLAY_LABEL) as InquiryDisplay[]).map((s) => (
                <NativeSelectOption key={s} value={s}>
                  {DISPLAY_LABEL[s]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field className="w-auto">
            <FieldLabel htmlFor="inqDateField">Date</FieldLabel>
            <NativeSelect id="inqDateField" value={dateField} onChange={(e) => setDateField(e.target.value as "created" | "hire")}>
              <NativeSelectOption value="created">Created</NativeSelectOption>
              <NativeSelectOption value="hire">Hire date</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field className="w-auto">
            <FieldLabel htmlFor="inqFrom">From</FieldLabel>
            <Input id="inqFrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field className="w-auto">
            <FieldLabel htmlFor="inqTo">To</FieldLabel>
            <Input id="inqTo" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field className="w-auto">
            <FieldLabel htmlFor="inqSort">Sort</FieldLabel>
            <NativeSelect id="inqSort" value={sort} onChange={(e) => setSort(e.target.value)}>
              <NativeSelectOption value="created-desc">Newest first</NativeSelectOption>
              <NativeSelectOption value="created-asc">Oldest first</NativeSelectOption>
              <NativeSelectOption value="hire-asc">Hire date (soonest)</NativeSelectOption>
              <NativeSelectOption value="hire-desc">Hire date (latest)</NativeSelectOption>
              <NativeSelectOption value="ref">Reference</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Button asChild className="ml-auto rounded-full">
            <Link href="/admin/dashboard/bookings/new">Create New Inquiry</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {shown.length === 0 ? (
            <Empty className="py-8">
              <EmptyHeader>
                <EmptyTitle>{inquiries.length ? "No inquiries match" : "No inquiries yet"}</EmptyTitle>
                <EmptyDescription>
                  {inquiries.length ? "Change the filters, or choose “All” statuses." : "Use Create New Inquiry to add the first one."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Hire date</TableHead>
                  <TableHead>Vehicles</TableHead>
                  <TableHead className="text-right">Quoted</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-xs font-medium">{i.ref}</TableCell>
                    <TableCell>
                      <div className="font-medium">{i.customer}</div>
                      <div className="text-xs text-muted-foreground">{i.phone}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(i.hireDate)}</TableCell>
                    <TableCell className="max-w-56 whitespace-normal">{vehiclesOf(i)}</TableCell>
                    <TableCell className="text-right tabular-nums">{rs(i.quotedTotal)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{fmtDate(i.createdAt.slice(0, 10))}</TableCell>
                    <TableCell>
                      <StatusBadge status={i.display} />
                    </TableCell>
                    <TableCell className="text-xs">{i.createdByName}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setOpen(i.id)}>
                        <EyeIcon data-icon="inline-start" />
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <InquiryDetails id={open} showQuote={!!showQuote && open === openId} onClose={() => setOpen(null)} />
    </div>
  )
}

type Details = { inquiry: InquiryView; versions: QuotationVersion[]; events: BookingEvent[] }

function InquiryDetails({ id, showQuote, onClose }: { id: string | null; showQuote: boolean; onClose: () => void }) {
  const router = useRouter()
  const [data, setData] = React.useState<{ id: string; d: Details } | null>(null)
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [preview, setPreview] = React.useState<QuotationVersion | null>(null)
  const [confirming, setConfirming] = React.useState(false)
  const autoQuote = React.useRef(showQuote)

  // Shows a loaded inquiry (and its newest quotation, once, when asked to).
  const show = React.useCallback((inquiryId: string, r: Awaited<ReturnType<typeof getInquiryAction>>) => {
    if (!r.ok) return setError(r.error)
    setData({ id: inquiryId, d: r.data })
    setError("")
    if (autoQuote.current && r.data.versions.length) {
      autoQuote.current = false
      setPreview(r.data.versions[r.data.versions.length - 1])
    }
  }, [])
  const load = async (inquiryId: string) => show(inquiryId, await getInquiryAction(inquiryId))

  React.useEffect(() => {
    if (!id) return
    let live = true
    void getInquiryAction(id).then((r) => live && show(id, r))
    return () => {
      live = false
    }
  }, [id, show])

  const d = data && data.id === id ? data.d : null
  const i = d?.inquiry

  // Runs one action, then reloads the inquiry and the list.
  async function act(fn: () => Promise<unknown>, done: string) {
    if (!i) return
    setBusy(true)
    try {
      await fn()
      toast.success(done)
      await load(i.id)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const latest = d?.versions.at(-1)
  const open = !!i && ["pending_quotation", "quotation_ready", "awaiting_confirmation"].includes(i.status)

  return (
    <>
      <Dialog open={!!id} onOpenChange={(o) => !o && !busy && onClose()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{i?.ref ?? "Inquiry"}</span>
              {i && <StatusBadge status={i.display} />}
            </DialogTitle>
            <DialogDescription>
              {i ? `${i.customer} · ${i.phone} · created ${when(i.createdAt)} by ${i.createdByName}` : error || "Loading…"}
            </DialogDescription>
          </DialogHeader>

          {!i ? (
            error ? null : <Skeleton className="h-64 rounded-xl" />
          ) : (
            <div className="grid gap-4 text-sm">
              <dl className="grid gap-2 rounded-xl border p-3 sm:grid-cols-2">
                <Info label="Hire date" value={fmtDate(i.hireDate)} />
                <Info label="Vehicles" value={vehiclesOf(i)} />
                <Info label="Quoted total" value={rs(i.quotedTotal)} />
                <Info label="Quotation" value={i.quoteVersion ? `Version ${i.quoteVersion}${i.validUntil ? ` · valid until ${fmtDate(i.validUntil)}` : ""}` : "Not generated yet"} />
                {i.sentAt && <Info label="Sent" value={when(i.sentAt)} />}
                {i.status === "rejected" && <Info label="Rejected" value={`${i.rejectReason}${i.rejectNote ? ` — ${i.rejectNote}` : ""}`} />}
                {i.closedReason && <Info label={i.bookingStatus === "removed" ? "Removed" : "Cancelled"} value={i.closedReason} />}
              </dl>

              {i.input.cars.map((c) => (
                <div key={c.carId} className="rounded-xl bg-muted/40 p-3">
                  <div className="font-medium">
                    {c.carName} · {rs(c.rate)}
                  </div>
                  <div className="text-muted-foreground">
                    {c.pickupTime} {c.pickupLoc}
                    {c.stops.map((s) => ` → ${s.loc}`).join("")} → {c.dropTime} {c.dropLoc}
                  </div>
                </div>
              ))}

              <section className="grid gap-2">
                <h3 className="font-medium">Quotations</h3>
                {d.versions.length === 0 ? (
                  <p className="text-muted-foreground">No quotation yet.</p>
                ) : (
                  <ul className="grid gap-1.5">
                    {d.versions.map((v) => (
                      <li key={v.version} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2">
                        <span className="font-medium">Version {v.version}</span>
                        <span className="tabular-nums">{rs(v.total)}</span>
                        <span className="text-muted-foreground">
                          valid until {fmtDate(v.validUntil)} · {when(v.createdAt)} · {v.createdBy}
                        </span>
                        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setPreview(v)}>
                          <FileTextIcon data-icon="inline-start" />
                          Preview
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="grid gap-2">
                <h3 className="font-medium">History</h3>
                <ol className="grid gap-1 border-l pl-4">
                  {d.events.map((e, k) => (
                    <li key={k} className="relative">
                      <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-primary" />
                      <span className="font-medium">{EVENT_LABEL[e.action] ?? e.action}</span>
                      {e.prev && e.next && e.prev !== e.next && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {STEP_LABEL(e.prev)} → {STEP_LABEL(e.next)}
                        </span>
                      )}
                      {e.amount != null && <span className="text-muted-foreground"> · {rs(e.amount)}</span>}
                      {e.reason && <span className="text-muted-foreground"> · {e.reason}</span>}
                      <div className="text-xs text-muted-foreground">
                        {when(e.at)} · {e.by}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          )}

          {i && (
            <DialogFooter className="flex-wrap gap-2">
              {i.status === "pending_quotation" && (
                <Button disabled={busy} onClick={() => act(() => call(generateQuotationAction(i.id)), `Quotation generated for ${i.ref}`)}>
                  <FileTextIcon data-icon="inline-start" />
                  Generate Quotation
                </Button>
              )}
              {latest && (
                <Button variant="outline" disabled={busy} onClick={() => setPreview(latest)}>
                  <EyeIcon data-icon="inline-start" />
                  Preview / Download Quotation
                </Button>
              )}
              {open && latest && (
                <Button variant="outline" disabled={busy} onClick={() => act(() => call(markSentAction(i.id)), `${i.ref} marked as sent`)}>
                  <SendIcon data-icon="inline-start" />
                  {i.status === "awaiting_confirmation" ? "Mark sent again" : "Mark as Sent"}
                </Button>
              )}
              {open && (
                <Button variant="outline" asChild>
                  <Link href={`/admin/dashboard/inquiries/${encodeURIComponent(i.id)}/edit`}>
                    <PencilIcon data-icon="inline-start" />
                    {i.quoteVersion ? "Edit Quotation" : "Edit Inquiry"}
                  </Link>
                </Button>
              )}
              {open && (
                <ReasonDialog
                  trigger={
                    <Button variant="outline" disabled={busy}>
                      <XCircleIcon data-icon="inline-start" />
                      Reject Inquiry
                    </Button>
                  }
                  title={`Reject ${i.ref}?`}
                  description="The customer turned the quotation down. The inquiry is kept (with its quotation) for the reports, and leaves the open list."
                  confirmLabel="Reject inquiry"
                  reasons={REJECT_REASONS}
                  onConfirm={async (reason, note) => {
                    await call(rejectInquiryAction(i.id, { reason, note }))
                    toast.success(`${i.ref} rejected`)
                    await load(i.id)
                    router.refresh()
                  }}
                />
              )}
              {open && latest && (
                <Button disabled={busy} onClick={() => setConfirming(true)}>
                  <CheckCircle2Icon data-icon="inline-start" />
                  Confirm & Convert to Hire
                </Button>
              )}
              {i.bookingId && (
                <Button variant="outline" asChild>
                  <Link href="/admin/dashboard/history">Open List Hires</Link>
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm & convert */}
      <Dialog open={confirming} onOpenChange={(o) => !busy && setConfirming(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm {i?.ref}?</DialogTitle>
            <DialogDescription>
              Has the customer confirmed this quotation? Do you want to convert this inquiry into a confirmed hire? The cars are checked
              again and reserved; the hire keeps the reference {i?.ref}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
              Not yet
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (!i) return
                await act(async () => {
                  await call(convertInquiryAction(i.id))
                  await reloadBridal()
                }, `${i.ref} is now a confirmed hire`)
                setConfirming(false)
              }}
            >
              {busy ? "Confirming…" : "Yes, confirm hire"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {i && <QuotationPreview inquiry={i} version={preview} onClose={() => setPreview(null)} />}
    </>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground uppercase">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

// The quotation document (the invoice layout titled QUOTATION) with Download.
function QuotationPreview({ inquiry, version, onClose }: { inquiry: InquiryView; version: QuotationVersion | null; onClose: () => void }) {
  const { settings } = useBridal()
  const booking = React.useMemo(() => {
    if (!version) return null
    const rate = version.input.cars.reduce((n, c) => n + c.rate, 0)
    const decoCost = version.input.deco === "fresh" ? FRESH_FLOWER_COST * version.input.cars.length : 0
    const m = bookingMoney({ rate, decoCost, discount: version.input.discount, advance: version.input.advance })
    return quotationAsBooking(inquiry, version, { rate, decoCost, discount: m.discount, balance: m.balance })
  }, [inquiry, version])
  const quotation = version ? { issued: version.createdAt.slice(0, 10), validUntil: version.validUntil } : undefined
  const { preview, downloadButton } = useInvoicePreview(booking, settings, quotation)
  return (
    <Dialog open={!!version} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            Quotation {inquiry.ref}
            {version && version.version > 1 ? ` · version ${version.version}` : ""}
          </DialogTitle>
          <DialogDescription>{inquiry.customer}</DialogDescription>
        </DialogHeader>
        {preview}
        <DialogFooter>{downloadButton}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
