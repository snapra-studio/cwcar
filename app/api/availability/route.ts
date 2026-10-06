import { after, NextResponse } from "next/server"

import { syncFacebookReelIfDue } from "@/lib/server/facebook"
import { isPublicCarFree } from "@/lib/server/repo"
import { todayInBusinessTz } from "@/lib/server/today"

// Public, no login: "is this car free on this date?" for the customer website.
//   GET /api/availability?car=<id>&date=YYYY-MM-DD[&from=HH:MM&to=HH:MM]
//   -> { available: true | false }
// Only our own fleet can be checked. Nothing about existing hires (times,
// customers, other cars) is ever returned.
const ISO = /^\d{4}-\d{2}-\d{2}$/
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } })

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams
  const car = (p.get("car") ?? "").slice(0, 80)
  const date = p.get("date") ?? ""
  const from = p.get("from") || undefined
  const to = p.get("to") || undefined
  if (!car || !ISO.test(date)) return bad("Choose a car and a date.")
  const today = todayInBusinessTz()
  if (date < today) return bad("Choose today or a later date.")
  if ((Date.parse(date) - Date.parse(today)) / 86_400_000 > 3 * 366) return bad("Choose a date within the next three years.")
  if (!!from !== !!to || (from && (!HHMM.test(from) || !HHMM.test(to!) || to! <= from))) {
    return bad("Choose a start time and a later end time, or leave both empty.")
  }
  // After answering, check Facebook for a newer reel (at most every 30 min).
  after(() => syncFacebookReelIfDue().catch((err) => console.error("Facebook sync:", err)))
  const available = await isPublicCarFree(car, date, from, to)
  if (available === null) return bad("That car isn't available to book online.", 404)
  return NextResponse.json({ available }, { headers: { "Cache-Control": "no-store" } })
}
