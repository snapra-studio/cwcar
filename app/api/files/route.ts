import { NextResponse } from "next/server"

import { DOC_TYPES, MAX_UPLOAD_BYTES, type DocOwner } from "@/lib/bridal/types"
import { UserError } from "@/lib/server/errors"
import { ownerExists, saveFile } from "@/lib/server/files"
import { Forbidden, requireAdmin } from "@/lib/server/guard"

// Admin-only document upload (multipart form):
//   file, ownerType (booking | ledger | car_doc | driver_doc), ownerId,
//   docType (one of DOC_TYPES[ownerType]), expiresOn (YYYY-MM-DD, optional)
// A route handler rather than a server action so PDFs up to 15 MB fit.
const OWNERS = Object.keys(DOC_TYPES) as DocOwner[]
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof Forbidden) return bad("Log in again.", 401)
    throw err
  }
  // Refuse oversized uploads before reading them.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) {
    return bad("Files can be up to 15 MB.", 413)
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return bad("Upload the file as a form.")
  }
  const file = form.get("file")
  const ownerType = String(form.get("ownerType") ?? "") as DocOwner
  const ownerId = String(form.get("ownerId") ?? "").trim()
  const docType = String(form.get("docType") ?? "").trim()
  const expiresOn = String(form.get("expiresOn") ?? "").trim()

  if (!(file instanceof File)) return bad("Choose a file.")
  if (!OWNERS.includes(ownerType) || !/^[\w-]{1,80}$/.test(ownerId)) return bad("Unknown place to attach the file.")
  const kind = DOC_TYPES[ownerType].find((d) => d.label === docType)
  if (!kind) return bad("Pick what kind of document this is.")
  if (expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) return bad("Use a YYYY-MM-DD expiry date.")
  if (file.size > MAX_UPLOAD_BYTES) return bad("Files can be up to 15 MB.", 413)

  try {
    if (!(await ownerExists(ownerType, ownerId))) return bad("That record no longer exists.", 404)
    const meta = await saveFile({
      ownerType,
      ownerId,
      bytes: new Uint8Array(await file.arrayBuffer()),
      fileName: file.name,
      docType,
      expiresOn: kind.expires ? expiresOn || undefined : undefined,
    })
    return NextResponse.json({ file: meta })
  } catch (err) {
    if (err instanceof UserError) return bad(err.message)
    console.error("Upload failed:", err)
    return bad("Could not upload the file. Try again.", 500)
  }
}
