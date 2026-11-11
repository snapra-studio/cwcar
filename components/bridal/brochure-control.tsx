"use client"

import * as React from "react"
import Link from "next/link"
import { BookOpenIcon, ExternalLinkIcon, FileUpIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { ConfirmAction } from "@/components/bridal/confirm-action"
import { BrochureFlipbook } from "@/components/public/brochure-flipbook"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { setBrochure, useBridal } from "@/lib/bridal/store"
import { MAX_BROCHURE_BYTES } from "@/lib/bridal/types"

// Admin → Brochure: the PDF on the public site (/brochure, shown as a
// flip-book). Upload, replace (a new upload replaces the old one straight
// away) or remove it, and preview it as visitors see it.
export function BrochureView() {
  const { ready, settings } = useBridal()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const has = !!settings.brochure

  async function save(file: File | null) {
    if (file && file.type && file.type !== "application/pdf") return void toast.error("Upload the brochure as a PDF.")
    if (file && file.size > MAX_BROCHURE_BYTES) return void toast.error("Brochures can be up to 40 MB. Export a smaller PDF.")
    setBusy(true)
    try {
      await setBrochure(file)
      toast.success(file ? "Brochure updated on the website" : "Brochure removed from the website")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the brochure. Try again.")
    } finally {
      setBusy(false)
    }
  }

  if (!ready) return <Skeleton className="h-96 rounded-3xl" />

  const updated = settings.brochureUpdatedAt
    ? new Date(settings.brochureUpdatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : ""

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Brochure on the website</CardTitle>
          <CardDescription>
            Visitors open it from the website&apos;s Brochure link and flip through it like a book. Upload a PDF (up to 40 MB); a new
            upload replaces the current brochure straight away.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-4 rounded-xl border p-4 text-sm">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <BookOpenIcon className="size-6" />
            </span>
            {has ? (
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="text-xs text-muted-foreground uppercase">Current brochure</span>
                <span className="font-medium break-all">{settings.brochureName || "Brochure.pdf"}</span>
                {updated && <span className="text-xs text-muted-foreground">Uploaded {updated}</span>}
              </div>
            ) : (
              <span className="flex-1 text-muted-foreground">No brochure yet — the website hides its Brochure link until you add one.</span>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null
              e.target.value = ""
              if (file) void save(file)
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => inputRef.current?.click()}>
              <FileUpIcon data-icon="inline-start" />
              {busy ? "Uploading…" : has ? "Replace with updated brochure" : "Upload brochure"}
            </Button>
            {has && (
              <>
                <Button variant="outline" asChild>
                  <Link href="/brochure" target="_blank" rel="noreferrer">
                    <ExternalLinkIcon data-icon="inline-start" />
                    View on the website
                  </Link>
                </Button>
                <ConfirmAction
                  trigger={
                    <Button variant="outline" disabled={busy}>
                      <Trash2Icon data-icon="inline-start" />
                      Remove
                    </Button>
                  }
                  title="Remove the brochure from the website?"
                  description="The Brochure link disappears from the website until you upload a new one."
                  confirmLabel="Remove brochure"
                  onConfirm={() => save(null)}
                />
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {has && (
        <Card className="overflow-hidden p-0">
          <div className="bg-[radial-gradient(ellipse_at_top,#4A3F37_0%,#2A2420_55%,#1C1815_100%)] px-3 py-6 sm:px-8">
            <p className="mb-4 text-center text-xs font-medium tracking-[0.3em] text-[#F6EEE2]/70 uppercase">Preview — as visitors see it</p>
            {/* key: a new upload reloads the preview */}
            <BrochureFlipbook key={settings.brochure} url={settings.brochure!} title="Brochure preview" />
          </div>
        </Card>
      )}
    </div>
  )
}
