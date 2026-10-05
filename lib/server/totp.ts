import "server-only"

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"

// Time-based one-time codes (RFC 6238), as used by Google Authenticator:
// a 20-byte secret, SHA-1, 6 digits, a new code every 30 seconds.
//
// Secrets are stored encrypted (AES-256-GCM) with a key derived from
// TOTP_KEY, or AUTH_SECRET when that isn't set. Changing that value makes
// every admin set up the app again, so keep it stable.

const STEP = 30
const DIGITS = 6
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

export function base32(bytes: Uint8Array) {
  let bits = 0
  let value = 0
  let out = ""
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

function fromBase32(text: string) {
  const clean = text.replace(/[\s=-]/g, "").toUpperCase()
  const out: number[] = []
  let bits = 0
  let value = 0
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch)
    if (i < 0) throw new Error("Bad secret")
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export const newSecret = () => base32(randomBytes(20))

export function codeAt(secret: string, step: number) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const mac = createHmac("sha1", fromBase32(secret)).update(counter).digest()
  const offset = mac[mac.length - 1] & 15
  const n = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS
  return String(n).padStart(DIGITS, "0")
}

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP)

// The time step the code belongs to (allowing one step of clock drift either
// way), or null. The caller stores the step so the same code can't be reused.
export function verifyCode(secret: string, code: string, now = Date.now()): number | null {
  const clean = code.replace(/\s/g, "")
  if (!/^\d{6}$/.test(clean)) return null
  const step = currentStep(now)
  let found: number | null = null
  for (const s of [step - 1, step, step + 1]) {
    const expected = codeAt(secret, s)
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) found = s
  }
  return found
}

// What the Authenticator app scans.
export function otpauthUri(account: string, secret: string, issuer = "Chrish Wedding Cars") {
  const label = encodeURIComponent(`${issuer}:${account}`)
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`
}

// ---- Encryption at rest ----

function key() {
  const source = process.env.TOTP_KEY || process.env.AUTH_SECRET
  if (!source || source.length < 32) throw new Error("AUTH_SECRET (or TOTP_KEY) is missing or too short in .env.local")
  return createHash("sha256").update(`cwcar-totp:${source}`).digest()
}

export function seal(secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".")
}

export function unseal(sealed: string) {
  const [v, iv, tag, data] = sealed.split(".")
  if (v !== "v1") throw new Error("Unknown secret format")
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8")
}

// ---- One-time tokens and recovery codes ----

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")

export const newToken = () => randomBytes(32).toString("base64url")

// "k7mq-2xpd" style codes; easy to read, 40 bits each.
export function newRecoveryCodes(n = 8) {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789"
  return Array.from({ length: n }, () => {
    const b = randomBytes(8)
    const s = Array.from(b, (x) => chars[x % chars.length]).join("")
    return `${s.slice(0, 4)}-${s.slice(4)}`
  })
}

export const normalizeRecovery = (code: string) => code.trim().toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^(.{4})(.{4})$/, "$1-$2")
