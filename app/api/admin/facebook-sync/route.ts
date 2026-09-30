import { NextResponse } from "next/server"

import { getFacebookStatus, syncFacebookReel } from "@/lib/server/facebook"
import { Forbidden, requireAdmin } from "@/lib/server/guard"
import { getSettings } from "@/lib/server/repo"

// Admin-only: Facebook reel sync for the public page's background video.
//   GET   -> { status } (connected? last sync, reel now playing, last error)
//   POST  -> syncs now and switches the page to Facebook reels
//            -> { result, status, settings }
export const maxDuration = 300

async function admin() {
  try {
    await requireAdmin()
    return null
  } catch (err) {
    if (err instanceof Forbidden) return NextResponse.json({ error: "Log in again." }, { status: 401 })
    throw err
  }
}

export async function GET() {
  const denied = await admin()
  if (denied) return denied
  return NextResponse.json({ status: await getFacebookStatus() }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST() {
  const denied = await admin()
  if (denied) return denied
  const result = await syncFacebookReel({ force: true })
  return NextResponse.json({ result, status: await getFacebookStatus(), settings: await getSettings() })
}
