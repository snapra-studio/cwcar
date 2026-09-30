"use client"

import * as React from "react"
import { FileDownIcon, WalletIcon } from "lucide-react"
import { toast } from "sonner"

import { IndirectForm, indirectInPeriod } from "@/components/bridal/indirect-expenses"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtDate, monthRange, rs, todayIso } from "@/lib/bridal/format"
import { useBridal } from "@/lib/bridal/store"
import type { Car } from "@/lib/bridal/types"

// The indirect expenses assigned to one vehicle (finance, services, washes…),
// shown on its fleet card. Pick a period, add more, and download a PDF.

export function CarExpensesDialog({ car }: { car: Car }) {
  const { indirect, files, settings } = useBridal()
  const [open, setOpen] = React.useState(false)
  const [[from, to], setRange] = React.useState<readonly [string, string]>(monthRange(0))
  const [busy, setBusy] = React.useState(false)

  const mine = indirect.filter((e) => e.carId === car.id)
  const valid = !!from && !!to && from <= to
  const entries = valid
    ? indirectInPeriod(mine, from, to).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    : []
  const total = entries.reduce((n, e) => n + e.amount, 0)
  const [monthFrom, monthTo] = monthRange(0)
  const thisMonth = indirectInPeriod(mine, monthFrom, monthTo).reduce((n, e) => n + e.amount, 0)
  const receipts = (id: string) => files.filter((f) => f.ownerType === "indirect" && f.ownerId === id).length

  const year = todayIso().slice(0, 4)
  const earliest = mine.reduce((d, e) => (e.date < d ? e.date : d), todayIso())
  const latest = mine.reduce((d, e) => (e.date > d ? e.date : d), todayIso())
  const presets = [
    { label: "This month", range: monthRange(0) },
    { label: "Last month", range: monthRange(-1) },
    { label: "This year", range: [`${year}-01-01`, `${year}-12-31`] as const },
    { label: "All time", range: [earliest, latest] as const },
  ]

  async function download() {
    setBusy(true)
    try {
      const { downloadCarExpensesPdf } = await import("@/lib/bridal/car-expenses-pdf")
      await downloadCarExpensesPdf({ car, entries, from, to, settings, receiptsFor: receipts })
      toast.success(`PDF downloaded · ${entries.length} expense${entries.length === 1 ? "" : "s"}`)
    } catch {
      toast.error("Could not create the PDF. Reload the page and try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="rounded-full">
          <WalletIcon data-icon="inline-start" />
          Expenses{thisMonth ? ` · ${rs(thisMonth)}` : ""}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Expenses · {car.name} ({car.color})
          </DialogTitle>
          <DialogDescription>
            Indirect expenses assigned to this vehicle — finance, services, washes, repairs. They also appear under Income
            &amp; Expenses.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="flex flex-wrap items-end gap-3">
            <Field className="w-auto">
              <FieldLabel htmlFor={`cx-from-${car.id}`}>From</FieldLabel>
              <Input id={`cx-from-${car.id}`} type="date" value={from} onChange={(e) => setRange([e.target.value, to])} />
            </Field>
            <Field className="w-auto">
              <FieldLabel htmlFor={`cx-to-${car.id}`}>To</FieldLabel>
              <Input id={`cx-to-${car.id}`} type="date" value={to} onChange={(e) => setRange([from, e.target.value])} />
            </Field>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <Button key={p.label} variant="outline" size="sm" onClick={() => setRange(p.range)}>
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          <IndirectForm carId={car.id} idPrefix={`cx-${car.id}-`} />

          {!valid ? (
            <p className="text-sm text-destructive">Pick a start date on or before the end date.</p>
          ) : entries.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No expenses for this vehicle between {fmtDate(from)} and {fmtDate(to)}.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">{fmtDate(e.date)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{e.category}</Badge>
                    </TableCell>
                    <TableCell className="max-w-64 whitespace-normal text-muted-foreground">{e.note || "—"}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{rs(e.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>
                    Total · {entries.length} entr{entries.length === 1 ? "y" : "ies"}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{rs(total)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}

          <div className="flex justify-end">
            <Button className="rounded-full" onClick={download} disabled={!valid || busy}>
              <FileDownIcon data-icon="inline-start" />
              {busy ? "Preparing…" : "Download PDF"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
