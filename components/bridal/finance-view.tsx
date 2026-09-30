"use client"

import * as React from "react"
import { ChevronDownIcon, MinusCircleIcon, PaperclipIcon, PlusCircleIcon, SearchIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { ConfirmAction } from "@/components/bridal/confirm-action"
import { FilesDialog } from "@/components/bridal/files-dialog"
import { IndirectExpensesCard, indirectInPeriod } from "@/components/bridal/indirect-expenses"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { fmtDate, monthRange, parseIso, rs, todayIso } from "@/lib/bridal/format"
import { addLedgerEntry, carNames, hireMoney, isActive, removeLedgerEntry, useBridal } from "@/lib/bridal/store"
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type Booking,
  type LedgerEntry,
  type LedgerKind,
} from "@/lib/bridal/types"
import { cn } from "@/lib/utils"

export function FinanceView({ initialHireId }: { initialHireId?: string }) {
  const { ready } = useBridal()
  if (!ready) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }
  return <Finance initialHireId={initialHireId} />
}

function Finance({ initialHireId }: { initialHireId?: string }) {
  const { bookings, ledger, indirect } = useBridal()
  const linked = bookings.find((b) => b.id === initialHireId)
  // Opening from a hire shows the month that hire falls in.
  const [[from, to], setRange] = React.useState(() =>
    linked ? monthRange(0, parseIso(linked.date)) : monthRange(0)
  )
  const [hireId, setHireId] = React.useState(linked?.id ?? "")
  const [open, setOpen] = React.useState<string | null>(linked?.id ?? null)
  const formRef = React.useRef<HTMLDivElement>(null)

  const valid = !!from && !!to && from <= to
  const hires = bookings
    .filter((b) => isActive(b) && valid && b.date >= from && b.date <= to)
    .sort((a, b) => b.date.localeCompare(a.date) || b.invNo.localeCompare(a.invNo))
  const rows = hires.map((b) => ({ b, m: hireMoney(b, ledger) }))
  const sumRows = (list: typeof rows) =>
    list.reduce(
      (t, { m }) => ({
        hire: t.hire + m.hireIncome,
        extra: t.extra + m.extraIncome,
        out: t.out + m.expenses + m.partnerCost,
        profit: t.profit + m.profit,
      }),
      { hire: 0, extra: 0, out: 0, profit: 0 }
    )
  const totals = sumRows(rows)
  // Overheads in the period (services, car washes…) come off the profit.
  const indirectTotal = valid ? indirectInPeriod(indirect, from, to).reduce((n, e) => n + e.amount, 0) : 0

  // Searching by invoice number looks across every date, not just the period,
  // so an old hire can be found without changing the dates.
  const [query, setQuery] = React.useState("")
  const needle = normalizeInv(query)
  const shown = needle
    ? bookings
        .filter((b) => isActive(b) && normalizeInv(b.invNo).includes(needle))
        .sort((a, b) => b.date.localeCompare(a.date) || b.invNo.localeCompare(a.invNo))
        .map((b) => ({ b, m: hireMoney(b, ledger) }))
    : rows
  const shownTotals = needle ? sumRows(shown) : totals

  const presets = [
    { label: "This month", range: monthRange(0) },
    { label: "Last month", range: monthRange(-1) },
    { label: "This year", range: [`${todayIso().slice(0, 4)}-01-01`, `${todayIso().slice(0, 4)}-12-31`] as const },
  ]

  function addFor(b: Booking) {
    setHireId(b.id)
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Period</CardTitle>
          <CardDescription>Hires with a hire date in this period.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <Field className="w-auto">
            <FieldLabel htmlFor="finFrom">From</FieldLabel>
            <Input id="finFrom" type="date" value={from} onChange={(e) => setRange([e.target.value, to])} />
          </Field>
          <Field className="w-auto">
            <FieldLabel htmlFor="finTo">To</FieldLabel>
            <Input id="finTo" type="date" value={to} onChange={(e) => setRange([from, e.target.value])} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <Button key={p.label} variant="outline" size="sm" onClick={() => setRange(p.range)}>
                {p.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "Hire income", value: totals.hire },
          { label: "Extra income", value: totals.extra },
          { label: "Hire expenses", value: totals.out, hint: "incl. partner owners" },
          { label: "Indirect expenses", value: indirectTotal, hint: "not tied to a hire" },
          { label: "Net profit", value: totals.profit - indirectTotal, strong: true },
        ].map((s) => (
          <div key={s.label} className={cn("grid gap-1 rounded-xl border bg-card p-4", s.strong && "border-primary/40 bg-primary/10")}>
            <dt className="text-xs tracking-widest text-muted-foreground uppercase">
              {s.label}
              {s.hint && <span className="normal-case tracking-normal"> · {s.hint}</span>}
            </dt>
            <dd className={cn("text-2xl font-semibold tabular-nums", s.value < 0 && "text-destructive")}>{rs(s.value)}</dd>
          </div>
        ))}
      </dl>

      <div ref={formRef} className="scroll-mt-4">
        <EntryForm hireId={hireId} onHireChange={setHireId} onAdded={(b) => setOpen(b)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Hires</CardTitle>
          <CardDescription>
            Each hire&apos;s number is its invoice number. Open a hire to see and remove its entries.
          </CardDescription>
          <CardAction>
            <InputGroup className="w-64 max-w-full">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                aria-label="Search invoice number"
                placeholder="Search invoice no."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </InputGroup>
          </CardAction>
        </CardHeader>
        <CardContent>
          {needle && shown.length > 0 && (
            <p className="mb-3 text-sm text-muted-foreground">
              {shown.length} hire{shown.length === 1 ? "" : "s"} matching &ldquo;{query.trim()}&rdquo; · all dates
            </p>
          )}
          {!needle && !valid ? (
            <FieldError>Pick a start date on or before the end date.</FieldError>
          ) : shown.length === 0 ? (
            <Empty className="py-8">
              <EmptyHeader>
                <EmptyTitle>{needle ? `No hire matches “${query.trim()}”` : "No hires in this period"}</EmptyTitle>
                <EmptyDescription>
                  {needle
                    ? "Check the invoice number, e.g. WC-260929-01PX. Cancelled hires aren't listed."
                    : "Pick another period, or add a booking first."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hire no.</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Hire</TableHead>
                  <TableHead className="text-right">Extra in</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map(({ b, m }) => (
                  <HireRows
                    key={b.id}
                    booking={b}
                    money={m}
                    open={open === b.id}
                    onToggle={() => setOpen(open === b.id ? null : b.id)}
                    onAdd={() => addFor(b)}
                  />
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>Total · {shown.length} hire{shown.length === 1 ? "" : "s"}</TableCell>
                  <TableCell className="text-right tabular-nums">{rs(shownTotals.hire)}</TableCell>
                  <TableCell className="text-right tabular-nums">{rs(shownTotals.extra)}</TableCell>
                  <TableCell className="text-right tabular-nums">{rs(shownTotals.out)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{rs(shownTotals.profit)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>

      <IndirectExpensesCard from={from} to={to} valid={valid} />
    </div>
  )
}

function HireRows({
  booking: b,
  money: m,
  open,
  onToggle,
  onAdd,
}: {
  booking: Booking
  money: ReturnType<typeof hireMoney>
  open: boolean
  onToggle: () => void
  onAdd: () => void
}) {
  const partnerCars = b.cars.filter((c) => c.ownerCost)
  const entries = m.entries.slice().sort((x, y) => x.date.localeCompare(y.date) || x.createdAt.localeCompare(y.createdAt))

  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle} aria-expanded={open}>
        <TableCell className="font-medium">{b.invNo}</TableCell>
        <TableCell>{fmtDate(b.date)}</TableCell>
        <TableCell className="max-w-48 truncate">{b.customer}</TableCell>
        <TableCell className="text-right tabular-nums">{rs(m.hireIncome)}</TableCell>
        <TableCell className="text-right tabular-nums">{m.extraIncome ? rs(m.extraIncome) : "—"}</TableCell>
        <TableCell className="text-right tabular-nums">
          {m.expenses + m.partnerCost ? rs(m.expenses + m.partnerCost) : "—"}
        </TableCell>
        <TableCell className={cn("text-right font-semibold tabular-nums", m.profit < 0 && "text-destructive")}>
          {rs(m.profit)}
        </TableCell>
        <TableCell className="text-right">
          <ChevronDownIcon className={cn("inline size-4 transition-transform", open && "rotate-180")} />
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={8} className="bg-muted/40 whitespace-normal">
            <div className="grid gap-3 py-1">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  {b.type} · {carNames(b)}
                </span>
                <Button size="sm" onClick={onAdd}>
                  <PlusCircleIcon data-icon="inline-start" />
                  Add income / expense
                </Button>
              </div>
              {entries.length === 0 && partnerCars.length === 0 ? (
                <p className="text-sm text-muted-foreground">No extra income or expenses on this hire yet.</p>
              ) : (
                <ul className="grid gap-1.5">
                  {partnerCars.map((c, i) => (
                    <li key={`owner-${i}`} className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="outline">Owner payment</Badge>
                      <span>
                        {c.carName} · {c.ownerName}
                      </span>
                      <span className="ml-auto font-medium tabular-nums">− {rs(c.ownerCost ?? 0)}</span>
                      <span className="w-8" />
                    </li>
                  ))}
                  {entries.map((e) => (
                    <EntryItem key={e.id} entry={e} />
                  ))}
                </ul>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function EntryItem({ entry: e }: { entry: LedgerEntry }) {
  const income = e.kind === "income"
  const { files } = useBridal()
  const receipts = files.filter((f) => f.ownerType === "ledger" && f.ownerId === e.id).length
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <Badge variant={income ? "secondary" : "outline"}>{income ? "Income" : "Expense"}</Badge>
      <span className="font-medium">{e.category}</span>
      {e.note && <span className="text-muted-foreground">· {e.note}</span>}
      <span className="text-muted-foreground">· {fmtDate(e.date)}</span>
      <span className="ml-auto font-medium tabular-nums">
        {income ? "+" : "−"} {rs(e.amount)}
      </span>
      <FilesDialog
        ownerType="ledger"
        ownerId={e.id}
        title={`Receipt · ${e.category} ${rs(e.amount)}`}
        description="Attach a photo or PDF of the receipt."
        trigger={
          <Button
            size="sm"
            variant="ghost"
            className={cn("h-7 gap-1 px-2", receipts ? "text-primary" : "text-muted-foreground")}
            aria-label={receipts ? `${receipts} receipt(s)` : "Attach receipt"}
          >
            <PaperclipIcon className="size-4" />
            {receipts ? receipts : ""}
          </Button>
        }
      />
      <ConfirmAction
        trigger={
          <Button size="icon-sm" variant="ghost" aria-label={`Remove ${e.category}`}>
            <Trash2Icon />
          </Button>
        }
        title="Remove this entry?"
        description={`${income ? "Income" : "Expense"} · ${e.category} · ${rs(e.amount)}`}
        confirmLabel="Remove"
        onConfirm={async () => {
          try {
            await removeLedgerEntry(e.id)
            toast.success("Entry removed")
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not remove. Try again.")
          }
        }}
      />
    </li>
  )
}

const EMPTY_ENTRY = { kind: "expense" as LedgerKind, category: EXPENSE_CATEGORIES[0], amount: "", date: "", note: "" }

function EntryForm({
  hireId,
  onHireChange,
  onAdded,
}: {
  hireId: string
  onHireChange: (id: string) => void
  onAdded: (bookingId: string) => void
}) {
  const { bookings } = useBridal()
  const [entry, setEntry] = React.useState(EMPTY_ENTRY)
  const [error, setError] = React.useState("")

  const hires = bookings.filter(isActive).sort((a, b) => b.date.localeCompare(a.date))
  const hire = hires.find((b) => b.id === hireId)
  const categories = entry.kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const amount = Number(entry.amount) || 0
    if (!hire) return setError("Pick the hire this belongs to.")
    if (!(amount > 0)) return setError("Add an amount.")
    try {
      await addLedgerEntry({
        bookingId: hire.id,
        kind: entry.kind,
        category: entry.category,
        note: entry.note.trim(),
        amount,
        // Same default the date field shows: the hire's own date.
        date: entry.date || hire.date,
      })
      toast.success(`${entry.kind === "income" ? "Income" : "Expense"} added to ${hire.invNo}`)
      setEntry((x) => ({ ...EMPTY_ENTRY, kind: x.kind, category: x.category }))
      setError("")
      onAdded(hire.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Add income or expense</CardTitle>
        <CardDescription>Petrol, tolls, extra hours… linked to a hire by its number.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="entryHire">Hire no.</FieldLabel>
              <NativeSelect id="entryHire" className="w-full" value={hireId} onChange={(e) => onHireChange(e.target.value)}>
                <NativeSelectOption value="">Select a hire…</NativeSelectOption>
                {hires.map((b) => (
                  <NativeSelectOption key={b.id} value={b.id}>
                    {b.invNo} · {fmtDate(b.date)} · {b.customer}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            <RadioGroup
              value={entry.kind}
              onValueChange={(v) => {
                const kind = v as LedgerKind
                setEntry((x) => ({ ...x, kind, category: (kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)[0] }))
              }}
              className="grid-cols-2"
            >
              {([
                ["expense", "Expense", "Money out — petrol, tolls…", MinusCircleIcon],
                ["income", "Extra income", "Charged to the customer", PlusCircleIcon],
              ] as const).map(([value, title, note, Icon]) => (
                <FieldLabel key={value} htmlFor={`kind-${value}`}>
                  <Field orientation="horizontal">
                    <Icon className="size-5 text-muted-foreground" />
                    <div className="grid flex-1 gap-0.5">
                      <span className="font-medium">{title}</span>
                      <span className="text-xs text-muted-foreground">{note}</span>
                    </div>
                    <RadioGroupItem value={value} id={`kind-${value}`} />
                  </Field>
                </FieldLabel>
              ))}
            </RadioGroup>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="entryCategory">Category</FieldLabel>
                <NativeSelect
                  id="entryCategory"
                  className="w-full"
                  value={entry.category}
                  onChange={(e) => setEntry((x) => ({ ...x, category: e.target.value }))}
                >
                  {categories.map((c) => (
                    <NativeSelectOption key={c} value={c}>
                      {c}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="entryAmount">Amount (Rs)</FieldLabel>
                <Input
                  id="entryAmount"
                  type="number"
                  min={0}
                  step={100}
                  value={entry.amount}
                  onChange={(e) => setEntry((x) => ({ ...x, amount: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="entryDate">Date</FieldLabel>
                <Input
                  id="entryDate"
                  type="date"
                  value={entry.date || hire?.date || todayIso()}
                  onChange={(e) => setEntry((x) => ({ ...x, date: e.target.value }))}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="entryNote">Note (optional)</FieldLabel>
              <Textarea
                id="entryNote"
                rows={2}
                placeholder="e.g. 20 L at Ja-Ela filling station"
                value={entry.note}
                onChange={(e) => setEntry((x) => ({ ...x, note: e.target.value }))}
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
            <div>
              <Button type="submit" size="lg" className="rounded-full px-5">
                Add {entry.kind === "income" ? "income" : "expense"}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

// "wc 260929-01px", "#WC-26092901PX" and "WC-260929-01PX" all match.
function normalizeInv(s: string) {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "")
}
