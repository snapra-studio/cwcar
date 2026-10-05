import type { Metadata } from "next"
import { connection } from "next/server"

import { AvailabilityChecker } from "@/components/public/availability-checker"
import { todayInBusinessTz } from "@/lib/server/today"

export const metadata: Metadata = {
  title: "Chrish Wedding Cars & Rentals · Wedding car hire in Ja-Ela",
  description:
    "Luxury and classic wedding cars, decorated and chauffeured. See which car is free on your date and call to book.",
}

// The website's home page for customers (no login). Data comes from the
// public /api/availability route, which exposes no customer, price, route or
// driver details. The admin area is at /admin.
export default async function HomePage() {
  // Render per request so "today" is the real today, not the build date.
  await connection()
  return <AvailabilityChecker today={todayInBusinessTz()} />
}
