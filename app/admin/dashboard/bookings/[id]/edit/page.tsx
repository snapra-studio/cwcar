import { BookingForm } from "@/components/bridal/booking-form"
import { adminPage } from "@/lib/server/guard"

export default async function Page({ params }: PageProps<"/admin/dashboard/bookings/[id]/edit">) {
  await adminPage()
  const { id } = await params
  // key remounts the form when switching between bookings.
  return <BookingForm key={id} bookingId={id} />
}
