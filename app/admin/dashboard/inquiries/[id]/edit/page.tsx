import { notFound, redirect } from "next/navigation"
import { connection } from "next/server"

import { BookingForm } from "@/components/bridal/booking-form"
import { INQUIRY_OPEN } from "@/lib/bridal/inquiry"
import { staffPage } from "@/lib/server/guard"
import { getInquiry, scopeOf } from "@/lib/server/inquiries"

// Edit an open inquiry (or its quotation: saving issues a new version under
// the same reference).
export default async function Page({ params }: PageProps<"/admin/dashboard/inquiries/[id]/edit">) {
  await connection()
  const me = await staffPage()
  const { id } = await params
  const found = await getInquiry(id, scopeOf(me))
  if (!found) notFound()
  const i = found.inquiry
  if (!INQUIRY_OPEN.includes(i.status)) redirect(`/admin/dashboard/inquiries?open=${encodeURIComponent(i.id)}`)
  return <BookingForm key={i.id} inquiry={{ id: i.id, ref: i.ref, input: i.input }} />
}
