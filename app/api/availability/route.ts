import { NextResponse } from "next/server"

import { getBookedSlots, getPublicCars, getSettings } from "@/lib/server/repo"

// Public, no login. Returns only what a customer needs to see whether a car
// is free: car name/colour/type/photo, the booked time slots (car + start/end
// only), plus the public business contact details. No customer,
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
  const [settings, cars, slots] = await Promise.all([getSettings(), getPublicCars(), getBookedSlots(from, to)])
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
      // [{ carId, start, end }] as "YYYY-MM-DDTHH:MM"; nothing else about the hire.
      slots,
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
