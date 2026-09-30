import { NextResponse } from "next/server"

import { syncFacebookReel } from "@/lib/server/facebook"

// Optional scheduled check (e.g. a Vercel cron or any uptime pinger):
//   GET /api/cron/facebook-sync  with  Authorization: Bearer <CRON_SECRET>
// Without CRON_SECRET in the environment the route doesn't exist. Page
// visits also trigger a check at most every 30 minutes, so this is only
// needed to pick up new reels while nobody visits.
export const maxDuration = 300

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Not found", { status: 404 })
  }
  return NextResponse.json(await syncFacebookReel())
}
