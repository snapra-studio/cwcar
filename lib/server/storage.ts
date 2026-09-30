import "server-only"

import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

// S3-compatible object storage (Neon) for uploaded photos and documents.
// Settings come from .env.local: AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID,
// AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET.
//
// Objects are never linked to directly: the browser always goes through
// /api/files/[id], which checks permission first. Keys contain a random id so
// they can't be guessed.

const g = globalThis as unknown as { __cwcarS3?: S3Client }

function client() {
  if (!process.env.AWS_ENDPOINT_URL_S3 || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error("File storage isn't configured: set AWS_ENDPOINT_URL_S3 and the AWS keys in .env.local")
  }
  return (g.__cwcarS3 ??= new S3Client({
    endpoint: process.env.AWS_ENDPOINT_URL_S3,
    region: process.env.AWS_REGION || "us-east-2",
    forcePathStyle: true,
  }))
}

const bucket = () => {
  const b = process.env.S3_BUCKET
  if (!b) throw new Error("S3_BUCKET is missing in .env.local")
  return b
}

export async function putObject(key: string, body: Uint8Array, contentType: string) {
  await client().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }))
}

// The object's bytes as a web stream, for sending on to the browser.
// `range` ("bytes=0-1023") reads only part of it, for video streaming.
export async function getObject(key: string, range?: string) {
  const res = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: range }))
  if (!res.Body) throw new Error("Empty object")
  return res.Body.transformToWebStream()
}

// Best effort: a leftover object only wastes space, so failures are logged,
// not thrown (the database row is already gone).
export async function deleteObjects(keys: string[]) {
  if (!keys.length) return
  try {
    await client().send(
      new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } })
    )
  } catch (err) {
    console.error("Could not delete stored files:", keys, err)
  }
}
