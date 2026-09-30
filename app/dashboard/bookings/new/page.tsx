import { BookingForm } from "@/components/bridal/booking-form"

export default async function Page({ searchParams }: PageProps<"/dashboard/bookings/new">) {
  const { date, car } = await searchParams
  const initialDate = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined
  const initialCarId = typeof car === "string" ? car : undefined

  // key remounts the form when the user clicks "Book" for a different car/date.
  return (
    <BookingForm
      key={`${initialDate}-${initialCarId}`}
      initialDate={initialDate}
      initialCarId={initialCarId}
    />
  )
}
