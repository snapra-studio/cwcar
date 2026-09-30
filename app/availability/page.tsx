import type { Metadata } from "next"
import { connection } from "next/server"

import { AvailabilityChecker } from "@/components/public/availability-checker"
import { todayInBusinessTz } from "@/lib/server/today"

export const metadata: Metadata = {
  title: "Check availability · Crish Wedding Hires",
  description: "See which wedding cars are free on your date.",
}

// Public page, no login. Data comes from the public /api/availability route,
// which exposes no customer, price, route or driver details.
export default async function AvailabilityPage() {
  // Render per request so "today" is the real today, not the build date.
  await connection()
  return <AvailabilityChecker today={todayInBusinessTz()} />
}
