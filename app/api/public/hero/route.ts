import { NextResponse } from "next/server"

import { getPublicCars, getSettings } from "@/lib/server/repo"

// Public hero photo for the customer availability page: the landing
// background the admin uploaded on Home, else the first fleet photo.
// Photos live in file storage; this points the browser at /api/files/<id>.
export async function GET(request: Request) {
  const [settings, cars] = await Promise.all([getSettings(), getPublicCars()])
  const url = settings.coverImage ?? cars.find((c) => c.image)?.image
  if (!url?.startsWith("/api/files/")) return new NextResponse(null, { status: 404 })
  return NextResponse.redirect(new URL(url, request.url), { status: 307, headers: { "Cache-Control": "public, max-age=300" } })
}
