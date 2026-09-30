"use client"

import * as React from "react"
import { ExternalLinkIcon, FileSpreadsheetIcon, FileTextIcon, PaperclipIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { toast } from "sonner"

import { ConfirmAction } from "@/components/bridal/confirm-action"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { fmtDate, todayIso } from "@/lib/bridal/format"
import { expiryStatus, type ExpiryStatus } from "@/lib/bridal/logic"
import { deleteDocument, uploadDocument, useBridal } from "@/lib/bridal/store"
import { DOC_TYPES, MAX_UPLOAD_BYTES, type DocOwner, type FileMeta } from "@/lib/bridal/types"
import { cn } from "@/lib/utils"

// Admin pop-up to attach, open and remove documents for a hire, an expense,
// a car or a driver. Files go to file storage through POST /api/files.

const ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx"

export const fmtSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

const EXPIRY_STYLE: Record<ExpiryStatus, string> = {
  expired: "border-destructive/40 bg-destructive/10 text-destructive",
  soon: "border-amber-500/40 bg-amber-500/10 text-amber-800",
  ok: "border-emerald-600/30 bg-emerald-600/10 text-emerald-800",
}

export function ExpiryTag({ expiresOn }: { expiresOn?: string }) {
  const status = expiryStatus(expiresOn, todayIso())
  if (!status || !expiresOn) return null
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", EXPIRY_STYLE[status])}>
      {status === "expired" ? "Expired " : "Expires "}
      {fmtDate(expiresOn)}
    </span>
  )
}

// Worst expiry among the given documents, as a short warning ("Insurance
// expired", "Revenue licence expires soon"), or nothing when all is fine.
export function ExpiryWarning({ files, className }: { files: FileMeta[]; className?: string }) {
  const today = todayIso()
  const flagged = files
    .map((f) => ({ f, s: expiryStatus(f.expiresOn, today) }))
    .filter((x) => x.s === "expired" || x.s === "soon")
    .sort((a, b) => (a.s === b.s ? (a.f.expiresOn ?? "").localeCompare(b.f.expiresOn ?? "") : a.s === "expired" ? -1 : 1))
  if (!flagged.length) return null
  const top = flagged[0]
  const more = flagged.length > 1 ? ` +${flagged.length - 1}` : ""
  return (
    <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", EXPIRY_STYLE[top.s!], className)}>
      {top.f.docType} {top.s === "expired" ? "expired" : "expires soon"}
      {more}
    </span>
  )
}

function FileIcon({ file }: { file: FileMeta }) {
  if (file.contentType.startsWith("image/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- permission-checked file route
      <img src={file.url} alt="" className="size-11 shrink-0 rounded-lg border object-cover" loading="lazy" />
    )
  }
  const Icon = /sheet|excel/.test(file.contentType) ? FileSpreadsheetIcon : FileTextIcon
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground">
      <Icon className="size-5" />
    </span>
  )
}

export function FilesDialog({
  ownerType,
  ownerId,
  title,
  description,
  trigger,
}: {
  ownerType: DocOwner
  ownerId: string
  title: string
  description?: string
  // Custom trigger; defaults to a "Files (n)" button.
  trigger?: React.ReactNode
}) {
  const { files } = useBridal()
  const mine = files.filter((f) => f.ownerType === ownerType && f.ownerId === ownerId)
  const [open, setOpen] = React.useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="rounded-full">
            <PaperclipIcon data-icon="inline-start" />
            Files{mine.length ? ` (${mine.length})` : ""}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <FileList files={mine} />
        <UploadForm key={open ? "open" : "closed"} ownerType={ownerType} ownerId={ownerId} />
      </DialogContent>
    </Dialog>
  )
}

function FileList({ files }: { files: FileMeta[] }) {
  if (!files.length) {
    return <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">No files yet.</p>
  }
  return (
    <ul className="grid gap-2">
      {files.map((f) => (
        <li key={f.id} className="flex items-center gap-3 rounded-xl border bg-background/60 p-2.5">
          <FileIcon file={f} />
          <div className="grid min-w-0 flex-1 gap-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary">{f.docType || "File"}</Badge>
              <ExpiryTag expiresOn={f.expiresOn} />
            </div>
            <div className="truncate text-sm font-medium" title={f.fileName}>
              {f.fileName}
            </div>
            <div className="text-xs text-muted-foreground">
              {fmtSize(f.size)} · added {fmtDate(f.uploadedAt.slice(0, 10))}
            </div>
          </div>
          <Button asChild size="icon-sm" variant="ghost" aria-label={`Open ${f.fileName}`}>
            <a href={f.url} target="_blank" rel="noreferrer">
              <ExternalLinkIcon />
            </a>
          </Button>
          <ConfirmAction
            trigger={
              <Button size="icon-sm" variant="ghost" aria-label={`Delete ${f.fileName}`}>
                <Trash2Icon />
              </Button>
            }
            title="Delete this file?"
            description={`${f.docType} · ${f.fileName}. It's removed from storage and can't be recovered.`}
            confirmLabel="Delete file"
            onConfirm={async () => {
              try {
                await deleteDocument(f.id)
                toast.success("File deleted")
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not delete. Try again.")
              }
            }}
          />
        </li>
      ))}
    </ul>
  )
}

function UploadForm({ ownerType, ownerId }: { ownerType: DocOwner; ownerId: string }) {
  const types = DOC_TYPES[ownerType]
  const [docType, setDocType] = React.useState(types[0].label)
  const [expiresOn, setExpiresOn] = React.useState("")
  const [file, setFile] = React.useState<File | null>(null)
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const needsExpiry = !!types.find((t) => t.label === docType)?.expires
  const pid = `${ownerType}-${ownerId}`

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return setError("Choose a file.")
    if (file.size > MAX_UPLOAD_BYTES) return setError("Files can be up to 15 MB.")
    setBusy(true)
    setError("")
    try {
      await uploadDocument({ file, ownerType, ownerId, docType, expiresOn: needsExpiry ? expiresOn : undefined })
      toast.success(`${docType} uploaded`)
      setFile(null)
      setExpiresOn("")
      if (inputRef.current) inputRef.current.value = ""
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="rounded-xl border bg-muted/30 p-3">
      <FieldGroup className="gap-3">
        <div className={cn("grid gap-3", needsExpiry && "sm:grid-cols-2")}>
          {types.length > 1 && (
            <Field>
              <FieldLabel htmlFor={`${pid}-type`}>Type</FieldLabel>
              <NativeSelect id={`${pid}-type`} className="w-full" value={docType} onChange={(e) => setDocType(e.target.value)}>
                {types.map((t) => (
                  <NativeSelectOption key={t.label} value={t.label}>
                    {t.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}
          {needsExpiry && (
            <Field>
              <FieldLabel htmlFor={`${pid}-expires`}>Expires on (optional)</FieldLabel>
              <Input id={`${pid}-expires`} type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
            </Field>
          )}
        </div>
        <Field>
          <FieldLabel htmlFor={`${pid}-file`}>File</FieldLabel>
          <Input
            ref={inputRef}
            id={`${pid}-file`}
            type="file"
            accept={ACCEPT}
            className="cursor-pointer"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <FieldDescription>Photo, PDF, Word or Excel · up to 15 MB</FieldDescription>
        </Field>
        {error && <FieldError>{error}</FieldError>}
        <Button type="submit" className="w-fit rounded-full" disabled={busy}>
          <UploadIcon data-icon="inline-start" />
          {busy ? "Uploading…" : `Upload ${docType.toLowerCase()}`}
        </Button>
      </FieldGroup>
    </form>
  )
}
