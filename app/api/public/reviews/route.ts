import { after, NextResponse } from "next/server"

import { getGoogleReviews, refreshGoogleReviewsIfDue } from "@/lib/server/google-reviews"

// Public: the business's Google rating and latest reviews (a copy refreshed
// every 12 hours), plus links to the profile and to write a review.
export async function GET() {
  after(() => refreshGoogleReviewsIfDue().catch((err) => console.error("Google reviews:", err)))
  return NextResponse.json(await getGoogleReviews(), { headers: { "Cache-Control": "no-store" } })
}
