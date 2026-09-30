import { NextResponse } from "next/server"

import { getBookedCarIds, getPublicCars, getSettings } from "@/lib/server/repo"

// Public, no login. Returns only what a customer needs to see whether a car
// is free: car name/colour/type/photo and which cars are booked on which
// days, plus the public business contact details. No customer,
// price, route, driver, invoice or plate details.
//   GET /api/availability?from=2027-05-01&to=2027-05-31
const ISO = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const from = searchParams.get("from") ?? ""
  const to = searchParams.get("to") ?? ""
  if (!ISO.test(from) || !ISO.test(to) || from > to) {
    return NextResponse.json({ error: "Use ?from=YYYY-MM-DD&to=YYYY-MM-DD" }, { status: 400 })
  }
  // At most ~3 months per request.
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 95) {
    return NextResponse.json({ error: "Ask for 3 months or less at a time." }, { status: 400 })
  }
  const [settings, cars, booked] = await Promise.all([getSettings(), getPublicCars(), getBookedCarIds(from, to)])
  return NextResponse.json(
    {
      // Public contact details only (same as printed on invoices).
      business: (({ bizName, bizPhone, bizEmail, bizAddr }) => ({
        name: bizName,
        phone: bizPhone,
        email: bizEmail,
        address: bizAddr,
      }))(settings),
      cars,
      booked,
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
