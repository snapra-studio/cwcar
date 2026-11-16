"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"

// A confirm step that needs a reason: cancelling or removing a hire,
// rejecting an inquiry. With `reasons`, a list to pick from plus optional
// notes (required for "Other"); without, a written reason.
export function ReasonDialog({
  trigger,
  title,
  description,
  confirmLabel,
  reasons,
  onConfirm,
}: {
  trigger: React.ReactNode
  title: string
  description: string
  confirmLabel: string
  reasons?: readonly string[]
  // Throw (with a message) to keep the dialog open and show the error.
  onConfirm: (reason: string, note: string) => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [reason, setReason] = React.useState(reasons?.[0] ?? "")
  const [note, setNote] = React.useState("")
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function confirm() {
    const written = note.trim()
    if (!reasons && written.length < 3) return setError("Give the reason (at least a few words).")
    if (reasons && reason === "Other" && !written) return setError("Add a note for “Other”.")
    setBusy(true)
    setError("")
    try {
      await onConfirm(reasons ? reason : written, reasons ? written : "")
      setOpen(false)
      setNote("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {reasons && (
            <Field>
              <FieldLabel htmlFor="reason-pick">Reason</FieldLabel>
              <NativeSelect id="reason-pick" className="w-full" value={reason} onChange={(e) => setReason(e.target.value)}>
                {reasons.map((r) => (
                  <NativeSelectOption key={r} value={r}>
                    {r}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="reason-note">{reasons ? "Notes (optional)" : "Reason"}</FieldLabel>
            <Textarea id="reason-note" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {error && <FieldError>{error}</FieldError>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Keep
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={busy}>
            {busy ? "Saving…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
