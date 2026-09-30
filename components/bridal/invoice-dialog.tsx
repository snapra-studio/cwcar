"use client"

import { useInvoicePreview } from "@/components/bridal/invoice-preview"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog"
import { useBridal } from "@/lib/bridal/store"
import type { Booking } from "@/lib/bridal/types"

// Admin invoice pop-up: preview the invoice and download it as a PDF.
export function InvoiceDialog({
  booking,
  onOpenChange,
}: {
  booking: Booking | null
  onOpenChange: (open: boolean) => void
}) {
  const { settings } = useBridal()
  const { preview, downloadButton } = useInvoicePreview(booking, settings)

  return (
    <Dialog open={!!booking} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] gap-0 overflow-y-auto p-0 sm:max-w-[860px]">
        {booking && (
          <>
            <div className="px-6 pt-5 pb-3 pr-12">
              <DialogTitle className="text-lg font-semibold">
                Invoice {booking.invNo}
                {(booking.revision ?? 1) > 1 && ` · Rev ${booking.revision}`}
              </DialogTitle>
              <DialogDescription>{booking.customer}</DialogDescription>
            </div>

            <div className="bg-muted/60 p-4 sm:p-6">{preview}</div>

            <DialogFooter className="border-t px-6 py-4">
              <DialogClose asChild>
                <Button variant="outline">Close</Button>
              </DialogClose>
              {downloadButton}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
