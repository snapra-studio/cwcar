import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon } from "lucide-react"

import { InvoicePreview } from "@/components/bridal/invoice-preview"
import { Button } from "@/components/ui/button"
import { driverPage } from "@/lib/server/guard"
import { getDriverHire, getInvoiceSettings } from "@/lib/server/repo"

// Read-only invoice for a hire this driver is assigned to. There is no edit
// path for drivers anywhere: this page only renders and downloads.
export default async function DriverInvoicePage({ params }: PageProps<"/driver/hires/[id]/invoice">) {
  const driver = await driverPage()
  const { id } = await params
  const hire = getDriverHire(driver.id, id)
  if (!hire) notFound()
  // The invoice shows the whole hire as billed; strip the driver-only field.
  const { myCars: _mine, ...booking } = hire
  void _mine

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href={`/driver/hires/${encodeURIComponent(hire.id)}`}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back to hire
        </Link>
      </Button>
      <h1 className="text-2xl font-bold tracking-tight">Invoice {hire.invNo}</h1>
      <InvoicePreview booking={booking} settings={getInvoiceSettings()} />
    </>
  )
}
