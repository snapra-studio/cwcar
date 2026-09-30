"use client"

import * as React from "react"
import { DownloadIcon } from "lucide-react"
import { toast } from "sonner"

import { InvoiceSheet, SHEET_H, SHEET_W } from "@/components/bridal/invoice-sheet"
import { Button } from "@/components/ui/button"
import type { Booking, Settings } from "@/lib/bridal/types"

// Read-only invoice preview + PDF download, shared by the admin invoice dialog
// and the driver's invoice page. Takes the data as props so it doesn't depend
// on the admin data store.

// Shrinks the fixed-size A4 sheet to fit its box without reflowing it.
function useFitScale() {
  const [scale, setScale] = React.useState(1)
  const ref = React.useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const ro = new ResizeObserver(([e]) => setScale(Math.min(1, e.contentRect.width / SHEET_W)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, scale] as const
}

export function useInvoicePreview(booking: Booking | null, settings: Settings) {
  const [downloading, setDownloading] = React.useState(false)
  const sheetRef = React.useRef<HTMLDivElement | null>(null)
  const [sheetH, setSheetH] = React.useState(SHEET_H)
  const [fitRef, scale] = useFitScale()

  // The sheet grows past A4 when a booking has many stops; track its height
  // so the scaled preview box matches.
  const measureSheet = React.useCallback((el: HTMLDivElement | null) => {
    sheetRef.current = el
    if (!el) return
    const ro = new ResizeObserver(() => setSheetH(el.offsetHeight))
    ro.observe(el)
    return () => {
      ro.disconnect()
      sheetRef.current = null
    }
  }, [])

  async function download() {
    if (!booking || !sheetRef.current) return
    setDownloading(true)
    try {
      const { downloadInvoicePdf } = await import("@/lib/bridal/invoice-pdf")
      // Each revision gets its own file so earlier copies aren't overwritten.
      const rev = booking.revision ?? 1
      await downloadInvoicePdf(sheetRef.current, `${booking.invNo}${rev > 1 ? `-rev${rev}` : ""}.pdf`)
      toast.success("Invoice downloaded")
    } catch {
      toast.error("Could not create the PDF. Reload the page and try again.")
    } finally {
      setDownloading(false)
    }
  }

  const preview = booking ? (
    <div ref={fitRef} className="w-full">
      <div
        className="mx-auto overflow-hidden shadow-md ring-1 ring-border"
        style={{ width: SHEET_W * scale, height: sheetH * scale }}
      >
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <InvoiceSheet ref={measureSheet} booking={booking} settings={settings} />
        </div>
      </div>
    </div>
  ) : null

  const downloadButton = (
    <Button onClick={download} disabled={downloading || !booking}>
      <DownloadIcon data-icon="inline-start" />
      {downloading ? "Preparing…" : "Download PDF"}
    </Button>
  )

  return { preview, downloadButton }
}

// Stand-alone page version (used by drivers).
export function InvoicePreview({ booking, settings }: { booking: Booking; settings: Settings }) {
  const { preview, downloadButton } = useInvoicePreview(booking, settings)
  return (
    <div className="grid gap-3">
      <div className="flex justify-end">{downloadButton}</div>
      <div className="rounded-xl bg-muted/60 p-2 sm:p-4">{preview}</div>
    </div>
  )
}
