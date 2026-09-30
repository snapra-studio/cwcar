import { NextResponse } from "next/server"

import type { FileMeta } from "@/lib/bridal/types"
import { q } from "@/lib/server/db"
import { getFile } from "@/lib/server/files"
import { currentSession } from "@/lib/server/guard"
import { getDriver } from "@/lib/server/repo"
import { getObject } from "@/lib/server/storage"

// Serves one uploaded file after checking who may see it:
//   car photos, landing photo   anyone (they're on the public page)
//   hire files (booking)        admin, or a driver assigned to that hire
//   receipts, vehicle/driver papers   admin only
// Anyone else gets 404, so the response never confirms a file exists.
// Bytes are streamed from storage; the storage address is never revealed.
async function canRead(meta: FileMeta) {
  if (meta.ownerType === "car_image" || meta.ownerType === "cover") return true
  const session = await currentSession()
  if (session?.role === "admin") return true
  if (session?.role === "driver" && meta.ownerType === "booking") {
    const driver = await getDriver(session.sub)
    if (driver?.status !== "active") return false
    const rows = await q("SELECT 1 FROM booking_cars WHERE booking_id = $1 AND driver_id = $2 LIMIT 1", [meta.ownerId, driver.id])
    return rows.length > 0
  }
  return false
}

const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } })

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) return notFound()
  const file = await getFile(id)
  if (!file || !(await canRead(file.meta))) return notFound()

  const { meta } = file
  const isPublic = meta.ownerType === "car_image" || meta.ownerType === "cover"
  const inline = !new URL(request.url).searchParams.has("download") && /^(image\/|application\/pdf$)/.test(meta.contentType)
  let body: ReadableStream
  try {
    body = await getObject(file.s3Key)
  } catch (err) {
    console.error("File storage read failed:", id, err)
    return new NextResponse("File temporarily unavailable", { status: 502, headers: { "Cache-Control": "no-store" } })
  }
  return new NextResponse(body, {
    headers: {
      "Content-Type": meta.contentType,
      "Content-Length": String(meta.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(meta.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      // Documents can't run scripts even if opened directly.
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      // A file id's content never changes (a new upload gets a new id), so
      // public photos can be cached for good; private files never are.
      "Cache-Control": isPublic ? "public, max-age=31536000, immutable" : "private, no-store",
    },
  })
}
