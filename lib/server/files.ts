import "server-only"

import { randomBytes } from "node:crypto"

import { MAX_UPLOAD_BYTES, MAX_VIDEO_BYTES, type DocOwner, type FileMeta } from "@/lib/bridal/types"
import { q, type Row } from "@/lib/server/db"
import { UserError } from "@/lib/server/errors"
import { deleteObjects, putObject } from "@/lib/server/storage"

// Uploaded photos and documents: bytes in file storage, a row in `files`.
// Everything the browser sees is /api/files/<id>; that route checks who may
// read each file (see canReadFile in app/api/files/[id]/route.ts).

export type FileOwnerType = FileMeta["ownerType"]

export const fileUrl = (id: string) => `/api/files/${id}`
const FILE_URL = /^\/api\/files\/([A-Za-z0-9_-]{16,64})$/
export const fileIdFromUrl = (url?: string) => url?.match(FILE_URL)?.[1]
export const isFileUrl = (url?: string) => !!fileIdFromUrl(url)

// Detects the real type from the first bytes instead of trusting the browser
// or the file name, so nothing else (HTML, scripts…) can be stored.
const SIGNATURES: { type: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  { type: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/png", ext: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: "image/gif", ext: "gif", test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
  {
    type: "image/webp",
    ext: "webp",
    test: (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP",
  },
  { type: "application/pdf", ext: "pdf", test: (b) => ascii(b, 0, 5) === "%PDF-" },
  // Videos (only accepted as the public page's background video).
  { type: "video/mp4", ext: "mp4", test: (b) => ascii(b, 4, 8) === "ftyp" && !/^(heic|heix|avif|mif1)/.test(ascii(b, 8, 12)) },
  { type: "video/webm", ext: "webm", test: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  // Word/Excel: new formats are zip files, old ones OLE compound files.
  { type: "application/zip", ext: "zip", test: (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04 },
  { type: "application/x-ole-storage", ext: "ole", test: (b) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 },
]
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to))

// Office files are only accepted with a matching extension, and get the
// proper Office content type.
const OFFICE: Record<string, { container: string; type: string }> = {
  docx: { container: "application/zip", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  xlsx: { container: "application/zip", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  doc: { container: "application/x-ole-storage", type: "application/msword" },
  xls: { container: "application/x-ole-storage", type: "application/vnd.ms-excel" },
}

function detectType(bytes: Uint8Array, fileName: string) {
  const sig = SIGNATURES.find((s) => s.test(bytes))
  if (!sig) return null
  if (sig.type.startsWith("image/") || sig.type.startsWith("video/") || sig.type === "application/pdf") return sig.type
  const ext = fileName.toLowerCase().split(".").pop() ?? ""
  const office = OFFICE[ext]
  return office && office.container === sig.type ? office.type : null
}

// Keeps names readable but safe for storage keys and download headers.
export function safeFileName(name: string) {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
  return cleaned || "file"
}

function toMeta(r: Row): FileMeta {
  return {
    id: String(r.id),
    ownerType: r.owner_type as FileMeta["ownerType"],
    ownerId: String(r.owner_id ?? ""),
    docType: String(r.doc_type ?? ""),
    expiresOn: r.expires_on == null ? undefined : String(r.expires_on),
    fileName: String(r.file_name),
    contentType: String(r.content_type),
    size: Number(r.size),
    uploadedAt: String(r.uploaded_at),
    url: fileUrl(String(r.id)),
  }
}

export async function saveFile(input: {
  ownerType: FileOwnerType
  ownerId: string
  bytes: Uint8Array
  fileName: string
  docType?: string
  expiresOn?: string
}): Promise<FileMeta> {
  const video = input.ownerType === "cover_video"
  if (!input.bytes.length) throw new UserError("That file is empty.")
  if (input.bytes.length > (video ? MAX_VIDEO_BYTES : MAX_UPLOAD_BYTES)) {
    throw new UserError(video ? "Videos can be up to 40 MB. Export a shorter or smaller clip." : "Files can be up to 15 MB.")
  }
  const fileName = safeFileName(input.fileName)
  const contentType = detectType(input.bytes, fileName)
  if (video) {
    if (!contentType?.startsWith("video/")) throw new UserError("Upload an MP4 or WebM video.")
  } else if (!contentType || contentType.startsWith("video/")) {
    throw new UserError("Upload a photo (JPG, PNG, WebP), a PDF, or a Word/Excel file.")
  }
  if ((input.ownerType === "car_image" || input.ownerType === "cover") && !contentType.startsWith("image/")) {
    throw new UserError("That isn't a photo.")
  }

  // 128 random bits: the key can't be guessed even though objects are private.
  const id = randomBytes(16).toString("base64url")
  const key = `${input.ownerType}/${id}/${fileName}`
  await putObject(key, input.bytes, contentType)
  try {
    const [row] = await q(
      `INSERT INTO files (id, owner_type, owner_id, doc_type, expires_on, s3_key, file_name, content_type, size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [id, input.ownerType, input.ownerId, input.docType ?? "", input.expiresOn || null, key, fileName, contentType, input.bytes.length]
    )
    return toMeta(row)
  } catch (err) {
    await deleteObjects([key])
    throw err
  }
}

// Photos arrive from the browser as data URLs (already resized there).
export async function saveDataUrlImage(dataUrl: string, ownerType: "car_image" | "cover", ownerId: string) {
  const m = dataUrl.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/)
  if (!m) throw new UserError("Unsupported photo.")
  const meta = await saveFile({
    ownerType,
    ownerId,
    bytes: Buffer.from(m[2], "base64"),
    fileName: `${ownerType === "cover" ? "background" : ownerId}.${m[1] === "jpeg" ? "jpg" : m[1]}`,
  })
  return meta.url
}

// A photo field from the browser: new data URL -> stored file URL; an existing
// file URL is kept; anything else is dropped.
export async function resolvePhoto(value: string | undefined, ownerType: "car_image" | "cover", ownerId: string) {
  if (!value) return undefined
  if (value.startsWith("data:")) return saveDataUrlImage(value, ownerType, ownerId)
  return isFileUrl(value) ? value : undefined
}

export async function getFile(id: string) {
  const [r] = await q("SELECT * FROM files WHERE id = $1", [id])
  return r ? { meta: toMeta(r), s3Key: String(r.s3_key) } : undefined
}

export async function listFiles(ownerType: DocOwner, ownerId: string) {
  return (await q("SELECT * FROM files WHERE owner_type = $1 AND owner_id = $2 ORDER BY uploaded_at", [ownerType, ownerId])).map(
    toMeta
  )
}

// Every document (not the public photos), for the admin screens.
export async function listAllDocs() {
  return (
    await q("SELECT * FROM files WHERE owner_type IN ('booking', 'ledger', 'car_doc', 'driver_doc', 'indirect') ORDER BY uploaded_at")
  ).map(toMeta)
}

async function removeRows(where: string, params: unknown[]) {
  const rows = await q(`DELETE FROM files WHERE ${where} RETURNING s3_key`, params)
  await deleteObjects(rows.map((r) => String(r.s3_key)))
  return rows.length
}

export const deleteFile = (id: string) => removeRows("id = $1", [id])

export const deleteFilesOf = (ownerType: FileOwnerType, ownerIds: string[]) =>
  ownerIds.length ? removeRows("owner_type = $1 AND owner_id = ANY($2::text[])", [ownerType, ownerIds]) : Promise.resolve(0)

// Removes the stored photo behind a /api/files/<id> URL (when replaced).
export async function deletePhotoUrl(url: string | undefined) {
  const id = fileIdFromUrl(url)
  if (id) await removeRows("id = $1 AND owner_type IN ('car_image', 'cover', 'cover_video')", [id])
}

// Does the thing a document is being attached to exist?
export async function ownerExists(ownerType: DocOwner, ownerId: string) {
  const table = { booking: "bookings", ledger: "ledger", car_doc: "cars", driver_doc: "users", indirect: "indirect_expenses" }[ownerType]
  const rows = await q(`SELECT 1 FROM ${table} WHERE id = $1`, [ownerId])
  return rows.length > 0
}
