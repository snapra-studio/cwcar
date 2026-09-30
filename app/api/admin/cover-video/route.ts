import { NextResponse } from "next/server"

import { MAX_VIDEO_BYTES } from "@/lib/bridal/types"
import { UserError } from "@/lib/server/errors"
import { saveFile } from "@/lib/server/files"
import { Forbidden, requireAdmin } from "@/lib/server/guard"
import { setCoverVideo } from "@/lib/server/repo"

// Admin-only: the background video of the public availability page.
//   POST   multipart "file" (MP4/WebM, up to 40 MB) -> replaces the video
//   DELETE                                         -> removes it
// Returns { settings }. A route handler so large files don't go through a
// server action.
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

async function admin() {
  try {
    await requireAdmin()
    return null
  } catch (err) {
    if (err instanceof Forbidden) return bad("Log in again.", 401)
    throw err
  }
}

export async function POST(request: Request) {
  const denied = await admin()
  if (denied) return denied
  if (Number(request.headers.get("content-length") ?? 0) > MAX_VIDEO_BYTES + 64 * 1024) {
    return bad("Videos can be up to 40 MB. Export a shorter or smaller clip.", 413)
  }
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return bad("Upload the video as a form.")
  }
  const file = form.get("file")
  if (!(file instanceof File)) return bad("Choose a video.")
  if (file.size > MAX_VIDEO_BYTES) return bad("Videos can be up to 40 MB. Export a shorter or smaller clip.", 413)
  try {
    const meta = await saveFile({
      ownerType: "cover_video",
      ownerId: "settings",
      bytes: new Uint8Array(await file.arrayBuffer()),
      fileName: file.name,
    })
    return NextResponse.json({ settings: await setCoverVideo(meta.url) })
  } catch (err) {
    if (err instanceof UserError) return bad(err.message)
    console.error("Video upload failed:", err)
    return bad("Could not upload the video. Try again.", 500)
  }
}

export async function DELETE() {
  const denied = await admin()
  if (denied) return denied
  return NextResponse.json({ settings: await setCoverVideo(undefined) })
}
