import { BookingForm } from "@/components/bridal/booking-form"
import { staffPage } from "@/lib/server/guard"

// Create New Inquiry: the booking form, saving an inquiry (permanent
// reference, Pending Quotation) instead of a confirmed hire.
export default async function Page({ searchParams }: PageProps<"/admin/dashboard/bookings/new">) {
  await staffPage()
  const { date, car } = await searchParams
  const initialDate = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined
  const initialCarId = typeof car === "string" ? car : undefined

  // key remounts the form when the user clicks "Book" for a different car/date.
  return (
    <BookingForm
      key={`${initialDate}-${initialCarId}`}
      initialDate={initialDate}
      initialCarId={initialCarId}
      asInquiry
    />
  )
}
