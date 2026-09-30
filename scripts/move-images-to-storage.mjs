// One-off: move photos stored inside the database (data URLs in cars.image
// and the landing photo in settings) into S3-compatible file storage, and
// replace them with /api/files/<id> links.
//
//   node --env-file=.env.local scripts/move-images-to-storage.mjs
//
// Safe to run again: only data URLs are moved.

import { randomBytes } from "node:crypto"

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import pg from "pg"

import { migrate } from "../lib/server/migrations.mjs"

for (const k of ["DATABASE_URL", "AWS_ENDPOINT_URL_S3", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "S3_BUCKET"]) {
  if (!process.env[k]) {
    console.error(`${k} is not set. Run with: node --env-file=.env.local scripts/move-images-to-storage.mjs`)
    process.exit(1)
  }
}

const s3 = new S3Client({ endpoint: process.env.AWS_ENDPOINT_URL_S3, region: process.env.AWS_REGION || "us-east-2", forcePathStyle: true })
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, enableChannelBinding: process.env.DATABASE_URL.includes("channel_binding=require") })
await db.connect()
await migrate(db)

// Same layout as lib/server/files.ts: <owner_type>/<random id>/<name>
async function store(dataUrl, ownerType, ownerId, baseName) {
  const m = dataUrl.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/)
  if (!m) return null
  const bytes = Buffer.from(m[2], "base64")
  const ext = m[1] === "jpeg" ? "jpg" : m[1]
  const id = randomBytes(16).toString("base64url")
  const fileName = `${baseName.replace(/[^\w.-]+/g, "-")}.${ext}`
  const key = `${ownerType}/${id}/${fileName}`
  await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: bytes, ContentType: `image/${m[1]}` }))
  await db.query(
    `INSERT INTO files (id, owner_type, owner_id, s3_key, file_name, content_type, size) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, ownerType, ownerId, key, fileName, `image/${m[1]}`, bytes.length]
  )
  return { url: `/api/files/${id}`, size: bytes.length }
}

let moved = 0
let bytes = 0
try {
  const cars = (await db.query("SELECT id, name, image FROM cars WHERE image LIKE 'data:%'")).rows
  for (const car of cars) {
    const r = await store(car.image, "car_image", car.id, car.id)
    if (!r) {
      console.warn(`  skipped ${car.name}: unsupported photo format`)
      continue
    }
    await db.query("UPDATE cars SET image = $2 WHERE id = $1", [car.id, r.url])
    moved++
    bytes += r.size
    console.log(`  car photo: ${car.name} (${Math.round(r.size / 1024)} KB)`)
  }

  const row = (await db.query("SELECT value FROM kv WHERE key = 'settings'")).rows[0]
  const settings = row ? JSON.parse(row.value) : null
  if (settings?.coverImage?.startsWith("data:")) {
    const r = await store(settings.coverImage, "cover", "settings", "background")
    if (r) {
      settings.coverImage = r.url
      await db.query("UPDATE kv SET value = $1 WHERE key = 'settings'", [JSON.stringify(settings)])
      moved++
      bytes += r.size
      console.log(`  landing photo (${Math.round(r.size / 1024)} KB)`)
    }
  }
  console.log(`Done: moved ${moved} photo(s), ${(bytes / 1024 / 1024).toFixed(2)} MB, out of the database into file storage.`)
} catch (err) {
  console.error("Stopped:", err.message, "(photos already moved stay moved; run again to continue)")
  process.exitCode = 1
} finally {
  await db.end()
}
