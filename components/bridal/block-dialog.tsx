"use client"

import * as React from "react"
import { WrenchIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { addDays } from "@/lib/bridal/format"
import { addBlock, fmtBlockRange, sortCars, useBridal } from "@/lib/bridal/store"
import { BLOCK_REASONS } from "@/lib/bridal/types"

// "Mark unavailable": takes a car out of service for a period (repair,
// service…). It shows on the calendar, bookings in that time are refused, and
// customers see "not available due to an unavoidable reason".

export function BlockDialog({ carId, date, trigger }: { carId?: string; date: string; trigger?: React.ReactNode }) {
  const { cars } = useBridal()
  const [open, setOpen] = React.useState(false)
  const blank = React.useCallback(
    () => ({
      carId: carId ?? "",
      allDay: true,
      fromDate: date,
      fromTime: "08:00",
      toDate: date,
      toTime: "17:00",
      reason: BLOCK_REASONS[0],
      note: "",
    }),
    [carId, date]
  )
  const [form, setForm] = React.useState(blank)
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  function openChange(next: boolean) {
    if (next) {
      setForm(blank())
      setError("")
    }
    setOpen(next)
  }

  const range = form.allDay
    ? { start: `${form.fromDate}T00:00`, end: form.toDate ? `${addDays(form.toDate, 1)}T00:00` : "" }
    : { start: `${form.fromDate}T${form.fromTime}`, end: `${form.toDate}T${form.toTime}` }
  const rangeOk = !!form.fromDate && !!form.toDate && range.end > range.start
  const idp = `blk-${carId ?? "any"}`

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.carId) return setError("Pick a car.")
    if (!rangeOk) return setError(form.allDay ? "The last day can't be before the first day." : "The end must be after the start.")
    setBusy(true)
    setError("")
    try {
      const b = await addBlock({ carId: form.carId, ...range, reason: form.reason, note: form.note.trim() })
      toast.success(`${b.carName} marked unavailable · ${fmtBlockRange(b)}`)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <WrenchIcon data-icon="inline-start" />
            Mark car unavailable
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mark car unavailable</DialogTitle>
          <DialogDescription>
            For a repair, service or anything else. The car can&apos;t be booked in this time, and customers checking
            availability see &ldquo;not available due to an unavoidable reason&rdquo;.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${idp}-car`}>Car</FieldLabel>
              <NativeSelect id={`${idp}-car`} className="w-full" value={form.carId} onChange={set("carId")}>
                <NativeSelectOption value="">Pick a car</NativeSelectOption>
                {sortCars(cars).map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.name} ({c.color})
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field orientation="horizontal">
              <Switch
                id={`${idp}-allday`}
                checked={form.allDay}
                onCheckedChange={(allDay) => setForm((f) => ({ ...f, allDay }))}
              />
              <FieldLabel htmlFor={`${idp}-allday`}>Whole day(s)</FieldLabel>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${idp}-fromDate`}>{form.allDay ? "First day" : "From"}</FieldLabel>
                <Input
                  id={`${idp}-fromDate`}
                  type="date"
                  value={form.fromDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fromDate: e.target.value, toDate: f.toDate < e.target.value ? e.target.value : f.toDate }))
                  }
                />
                {!form.allDay && <Input aria-label="From time" id={`${idp}-fromTime`} type="time" value={form.fromTime} onChange={set("fromTime")} />}
              </Field>
              <Field>
                <FieldLabel htmlFor={`${idp}-toDate`}>{form.allDay ? "Last day" : "Until"}</FieldLabel>
                <Input id={`${idp}-toDate`} type="date" min={form.fromDate} value={form.toDate} onChange={set("toDate")} />
                {!form.allDay && <Input aria-label="Until time" id={`${idp}-toTime`} type="time" value={form.toTime} onChange={set("toTime")} />}
              </Field>
            </div>
            {rangeOk && <FieldDescription>Unavailable: {fmtBlockRange(range)}</FieldDescription>}
            <Field>
              <FieldLabel htmlFor={`${idp}-reason`}>Reason (only you see this)</FieldLabel>
              <NativeSelect id={`${idp}-reason`} className="w-full" value={form.reason} onChange={set("reason")}>
                {BLOCK_REASONS.map((r) => (
                  <NativeSelectOption key={r} value={r}>
                    {r}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${idp}-note`}>Note (optional)</FieldLabel>
              <Textarea id={`${idp}-note`} rows={2} placeholder="e.g. Gearbox repair at Auto Mart, Ja-Ela" value={form.note} onChange={set("note")} />
            </Field>
            {error && <FieldError role="alert">{error}</FieldError>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                <WrenchIcon data-icon="inline-start" />
                {busy ? "Saving…" : "Mark unavailable"}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  )
}
