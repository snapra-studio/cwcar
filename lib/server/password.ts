import "server-only"

import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto"

// scrypt password hashing (Node built-in). Stored as
//   scrypt$<N>$<r>$<p>$<salt b64url>$<hash b64url>
// so the cost can be raised later without breaking existing hashes.

const N = 16384
const R = 8
const P = 1
const KEYLEN = 32

function derive(password: string, salt: Buffer, opts: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEYLEN, opts, (err, key) => (err ? reject(err) : resolve(key)))
  )
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = await derive(password, salt, { N, r: R, p: P })
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$")
}

export async function verifyPassword(password: string, stored: string) {
  const [algo, n, r, p, salt, hash] = stored.split("$")
  if (algo !== "scrypt" || !salt || !hash) return false
  const expected = Buffer.from(hash, "base64url")
  const key = await derive(password, Buffer.from(salt, "base64url"), { N: Number(n), r: Number(r), p: Number(p) })
  return key.length === expected.length && timingSafeEqual(key, expected)
}

// Hash of a random password, compared against when an email is unknown so a
// login attempt takes the same time whether or not the account exists.
let dummy: Promise<string> | null = null
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(12).toString("hex")))
