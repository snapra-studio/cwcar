import { BookingForm } from "@/components/bridal/booking-form"

export default async function Page({ params }: PageProps<"/admin/dashboard/bookings/[id]/edit">) {
  const { id } = await params
  // key remounts the form when switching between bookings.
  return <BookingForm key={id} bookingId={id} />
}
