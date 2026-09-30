"use client"

import * as React from "react"
import { FileSpreadsheetIcon, PaperclipIcon, PlusIcon, ReceiptIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { ConfirmAction } from "@/components/bridal/confirm-action"
import { FilesDialog } from "@/components/bridal/files-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtDate, rs, todayIso } from "@/lib/bridal/format"
import { addIndirect, assignIndirect, removeIndirect, sortCars, useBridal } from "@/lib/bridal/store"
import { INDIRECT_CATEGORIES, type IndirectExpense } from "@/lib/bridal/types"
import { cn } from "@/lib/utils"

// Business costs that don't belong to one hire: vehicle services, car washes,
// decoration cloths and flowers, and so on. Shown for the page's period and
// taken off the period's profit.

export const indirectInPeriod = (all: IndirectExpense[], from: string, to: string) =>
  all.filter((e) => e.date >= from && e.date <= to)

export function IndirectExpensesCard({ from, to, valid }: { from: string; to: string; valid: boolean }) {
  const { indirect, files } = useBridal()
  const [busy, setBusy] = React.useState(false)
  const entries = valid
    ? indirectInPeriod(indirect, from, to).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    : []
  const total = entries.reduce((n, e) => n + e.amount, 0)
  const receipts = (id: string) => files.filter((f) => f.ownerType === "indirect" && f.ownerId === id).length

  const byCategory = [...entries.reduce((m, e) => m.set(e.category, (m.get(e.category) ?? 0) + e.amount), new Map<string, number>())].sort(
    (a, b) => b[1] - a[1]
  )

  async function download() {
    setBusy(true)
    try {
      const { downloadIndirectExcel } = await import("@/lib/bridal/export-excel")
      const n = await downloadIndirectExcel(indirect, receipts, from, to)
      toast.success(`Excel downloaded · ${n} indirect expense${n === 1 ? "" : "s"}`)
    } catch {
      toast.error("Could not create the Excel file. Reload the page and try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ReceiptIcon className="size-5 text-primary" />
          Indirect expenses
        </CardTitle>
        <CardDescription>
          Costs not tied to one hire — vehicle services, car washes, decoration cloths &amp; flowers. They come off the
          period&apos;s profit.
        </CardDescription>
        <CardAction>
          <Button variant="outline" className="rounded-full" onClick={download} disabled={!valid || !entries.length || busy}>
            <FileSpreadsheetIcon data-icon="inline-start" />
            {busy ? "Preparing…" : "Download Excel"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-5">
        <IndirectForm />

        {entries.length === 0 ? (
          <Empty className="py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ReceiptIcon />
              </EmptyMedia>
              <EmptyTitle>No indirect expenses in this period</EmptyTitle>
              <EmptyDescription>Add one above, or pick another period.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            {byCategory.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {byCategory.map(([cat, amount]) => (
                  <span key={cat} className="rounded-full border bg-background/60 px-3 py-1 text-sm">
                    {cat} · <span className="font-semibold tabular-nums">{rs(amount)}</span>
                  </span>
                ))}
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Assigned vehicle</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <IndirectRow key={e.id} entry={e} receipts={receipts(e.id)} />
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4}>
                    Total · {entries.length} entr{entries.length === 1 ? "y" : "ies"}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{rs(total)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function IndirectRow({ entry: e, receipts }: { entry: IndirectExpense; receipts: number }) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">{fmtDate(e.date)}</TableCell>
      <TableCell>
        <Badge variant="secondary">{e.category}</Badge>
      </TableCell>
      <TableCell className="min-w-44">
        <AssignVehicle entry={e} />
      </TableCell>
      <TableCell className="max-w-64 whitespace-normal text-muted-foreground">{e.note || "—"}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">{rs(e.amount)}</TableCell>
      <TableCell className="text-right whitespace-nowrap">
        <FilesDialog
          ownerType="indirect"
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
          title="Remove this expense?"
          description={`${e.category} · ${rs(e.amount)} · ${fmtDate(e.date)}${receipts ? " (and its receipt)" : ""}`}
          confirmLabel="Remove"
          onConfirm={async () => {
            try {
              await removeIndirect(e.id)
              toast.success("Expense removed")
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not remove. Try again.")
            }
          }}
        />
      </TableCell>
    </TableRow>
  )
}

// Assigns an expense to one of the vehicles, e.g. a monthly finance payment.
// A vehicle that has since been removed stays listed under its saved name.
function AssignVehicle({ entry: e }: { entry: IndirectExpense }) {
  const { cars } = useBridal()
  const [busy, setBusy] = React.useState(false)
  const gone = e.carId && !cars.some((c) => c.id === e.carId)

  async function change(ev: React.ChangeEvent<HTMLSelectElement>) {
    const carId = ev.target.value || null
    setBusy(true)
    try {
      const saved = await assignIndirect(e.id, carId)
      toast.success(saved.carName ? `Assigned to ${saved.carName}` : "Not assigned to a vehicle")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not assign. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <NativeSelect
      size="sm"
      className="w-full"
      aria-label={`Assign ${e.category} to a vehicle`}
      value={e.carId ?? ""}
      disabled={busy}
      onChange={change}
    >
      <NativeSelectOption value="">Not assigned</NativeSelectOption>
      {gone && (
        <NativeSelectOption value={e.carId} disabled>
          {e.carName} (removed)
        </NativeSelectOption>
      )}
      {sortCars(cars).map((c) => (
        <NativeSelectOption key={c.id} value={c.id}>
          {c.name} ({c.color})
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}

const EMPTY_FORM = { date: "", category: INDIRECT_CATEGORIES[0], carId: "", amount: "", note: "" }

export function IndirectForm({ carId, idPrefix = "ind" }: { carId?: string; idPrefix?: string }) {
  const { cars } = useBridal()
  const [form, setForm] = React.useState({ ...EMPTY_FORM, carId: carId ?? "" })
  const fid = (name: string) => idPrefix + name
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const amount = Number(form.amount) || 0
    if (!(amount > 0)) return setError("Add an amount.")
    setBusy(true)
    setError("")
    try {
      await addIndirect({
        date: form.date || todayIso(),
        category: form.category,
        ...(form.carId && { carId: form.carId }),
        note: form.note.trim(),
        amount,
      })
      toast.success(`${form.category} added`)
      // Keep date and category for entering several in a row.
      setForm((f) => ({ ...EMPTY_FORM, date: f.date, category: f.category, carId: carId ?? "" }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-3 rounded-xl border bg-muted/30 p-3 sm:p-4">
      <div
        className={cn(
          "grid gap-3 sm:grid-cols-2",
          carId ? "sm:grid-cols-[150px_minmax(0,1fr)_140px]" : "lg:grid-cols-[150px_minmax(0,1.2fr)_minmax(0,1.2fr)_140px]"
        )}
      >
        <Field>
          <FieldLabel htmlFor={fid("Date")}>Date</FieldLabel>
          <Input id={fid("Date")} type="date" value={form.date || todayIso()} onChange={set("date")} />
        </Field>
        <Field>
          <FieldLabel htmlFor={fid("Category")}>Category</FieldLabel>
          <NativeSelect id={fid("Category")} className="w-full" value={form.category} onChange={set("category")}>
            {INDIRECT_CATEGORIES.map((c) => (
              <NativeSelectOption key={c} value={c}>
                {c}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        {!carId && (
        <Field>
          <FieldLabel htmlFor="indCar">Assign to vehicle (optional)</FieldLabel>
          <NativeSelect id="indCar" className="w-full" value={form.carId} onChange={set("carId")}>
            <NativeSelectOption value="">Not for one vehicle</NativeSelectOption>
            {sortCars(cars).map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name} ({c.color})
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        )}
        <Field>
          <FieldLabel htmlFor={fid("Amount")}>Amount (Rs)</FieldLabel>
          <Input id={fid("Amount")} type="number" min={0} step={100} value={form.amount} onChange={set("amount")} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field>
          <FieldLabel htmlFor={fid("Note")}>Note (optional)</FieldLabel>
          <Input id={fid("Note")} placeholder={carId ? "e.g. September finance instalment" : "e.g. Full service at Auto Mart, Ja-Ela"} value={form.note} onChange={set("note")} />
        </Field>
        <Button type="submit" className="rounded-full" disabled={busy}>
          <PlusIcon data-icon="inline-start" />
          {busy ? "Saving…" : carId ? "Add expense" : "Add indirect expense"}
        </Button>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </form>
  )
}
