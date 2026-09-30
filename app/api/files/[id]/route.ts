import { NextResponse } from "next/server"

import type { FileMeta } from "@/lib/bridal/types"
import { q } from "@/lib/server/db"
import { getFile } from "@/lib/server/files"
import { currentSession } from "@/lib/server/guard"
import { getDriver } from "@/lib/server/repo"
import { getObject } from "@/lib/server/storage"

// Serves one uploaded file after checking who may see it:
//   car photos, landing photo,  anyone (they're on the public page)
//   background video
//   hire files (booking)        admin, or a driver assigned to that hire
//   receipts, vehicle/driver papers   admin only
// Anyone else gets 404, so the response never confirms a file exists.
// Bytes are streamed from storage; the storage address is never revealed.
const PUBLIC: FileMeta["ownerType"][] = ["car_image", "cover", "cover_video"]

async function canRead(meta: FileMeta) {
  if (PUBLIC.includes(meta.ownerType)) return true
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
  const isPublic = PUBLIC.includes(meta.ownerType)
  const inline =
    !new URL(request.url).searchParams.has("download") && /^(image\/|video\/|application\/pdf$)/.test(meta.contentType)
  // Browsers fetch video in pieces ("Range: bytes=start-end"); answer with
  // just that piece so playback can start and seek without the whole file.
  const range = parseRange(request.headers.get("range"), meta.size)
  if (range === "invalid") {
    return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${meta.size}` } })
  }
  let body: ReadableStream
  try {
    body = await getObject(file.s3Key, range ? `bytes=${range.start}-${range.end}` : undefined)
  } catch (err) {
    console.error("File storage read failed:", id, err)
    return new NextResponse("File temporarily unavailable", { status: 502, headers: { "Cache-Control": "no-store" } })
  }
  return new NextResponse(body, {
    status: range ? 206 : 200,
    headers: {
      "Content-Type": meta.contentType,
      "Content-Length": String(range ? range.end - range.start + 1 : meta.size),
      "Accept-Ranges": "bytes",
      ...(range && { "Content-Range": `bytes ${range.start}-${range.end}/${meta.size}` }),
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

// One "bytes=a-b", "bytes=a-" or "bytes=-n" range; null = whole file.
function parseRange(header: string | null, size: number): { start: number; end: number } | null | "invalid" {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/)
  if (!m || (!m[1] && !m[2])) return null
  let start = m[1] ? Number(m[1]) : size - Number(m[2])
  let end = m[1] && m[2] ? Number(m[2]) : size - 1
  start = Math.max(0, start)
  end = Math.min(end, size - 1)
  return start > end || start >= size ? "invalid" : { start, end }
}
