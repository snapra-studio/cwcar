import { NextResponse } from "next/server"

import { MAX_BROCHURE_BYTES } from "@/lib/bridal/types"
import { UserError } from "@/lib/server/errors"
import { saveFile } from "@/lib/server/files"
import { Forbidden, requireAdmin } from "@/lib/server/guard"
import { setBrochure } from "@/lib/server/repo"

// Admin-only: the brochure PDF shown on the public site (/brochure).
//   POST   multipart "file" (PDF, up to 40 MB) -> replaces the brochure
//   DELETE                                  -> removes it
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
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BROCHURE_BYTES + 64 * 1024) {
    return bad("Brochures can be up to 40 MB. Export a smaller PDF.", 413)
  }
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return bad("Upload the brochure as a form.")
  }
  const file = form.get("file")
  if (!(file instanceof File)) return bad("Choose a PDF.")
  if (file.size > MAX_BROCHURE_BYTES) return bad("Brochures can be up to 40 MB. Export a smaller PDF.", 413)
  try {
    const meta = await saveFile({
      ownerType: "brochure",
      ownerId: "settings",
      bytes: new Uint8Array(await file.arrayBuffer()),
      fileName: file.name,
    })
    return NextResponse.json({ settings: await setBrochure({ url: meta.url, name: file.name.slice(0, 200) }) })
  } catch (err) {
    if (err instanceof UserError) return bad(err.message)
    console.error("Brochure upload failed:", err)
    return bad("Could not upload the brochure. Try again.", 500)
  }
}

export async function DELETE() {
  const denied = await admin()
  if (denied) return denied
  return NextResponse.json({ settings: await setBrochure(undefined) })
}
