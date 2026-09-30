import { NextResponse } from "next/server"

import { Forbidden, requireAdmin } from "@/lib/server/guard"
import { getAdminState, initializeFrom } from "@/lib/server/repo"

// One-time first run: imports data an older version saved in the admin's
// browser (or starts with the demo fleet), then returns the admin snapshot.
// A route handler rather than a server action because the old data can be
// several MB of car photos.
export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof Forbidden) return NextResponse.json({ error: "Log in again." }, { status: 401 })
    throw err
  }
  const text = await request.text()
  if (text.length > 25_000_000) return NextResponse.json({ error: "Too much data to import." }, { status: 413 })
  let body: { local?: unknown } = {}
  try {
    body = JSON.parse(text || "{}")
  } catch {
    return NextResponse.json({ error: "Invalid data." }, { status: 400 })
  }
  try {
    const local = body.local && typeof body.local === "object" ? (body.local as Parameters<typeof initializeFrom>[0]) : null
    const result = initializeFrom(local)
    return NextResponse.json({ ...result, state: getAdminState() })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Could not import this browser's data." }, { status: 500 })
  }
}
