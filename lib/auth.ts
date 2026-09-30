import "server-only"

import { createHash, createHmac, timingSafeEqual } from "node:crypto"

import type { Role } from "@/lib/bridal/types"

// Signed session cookie shared by admin and driver logins:
//   base64url({ sub, role, exp }) + "." + base64url(hmac)
// `sub` is "admin" for the admin, or the driver's users.id.
// This file only proves the cookie is genuine and unexpired; lib/server/guard.ts
// adds the database checks (driver still exists and is active).

export const SESSION_COOKIE = "cwh_session"
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // one week, in seconds

export type Session = { sub: string; role: Role; exp: number }

function secret() {
  const s = process.env.AUTH_SECRET
  if (!s || s.length < 32) throw new Error("AUTH_SECRET is missing or too short in .env.local")
  return s
}

const sign = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url")

// Constant-time compare so a wrong guess can't be timed character by character.
// Hashing first makes both sides the same length, so length isn't leaked either.
export function safeEqual(a: string, b: string) {
  const digest = (s: string) => createHash("sha256").update(s).digest()
  return timingSafeEqual(digest(a), digest(b))
}

export function createSessionToken(sub: string, role: Role) {
  const payload: Session = { sub, role, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE }
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${data}.${sign(data)}`
}

export function readSession(token: string | undefined): Session | null {
  if (!token) return null
  const [data, mac] = token.split(".")
  if (!data || !mac) return null
  try {
    if (!safeEqual(mac, sign(data))) return null
    const s = JSON.parse(Buffer.from(data, "base64url").toString()) as Session
    if (typeof s.exp !== "number" || s.exp < Date.now() / 1000) return null
    if (s.role !== "admin" && s.role !== "driver") return null
    if (typeof s.sub !== "string" || !s.sub) return null
    return s
  } catch {
    return null
  }
}

export function checkAdminCredentials(email: string, password: string) {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminEmail || !adminPassword) return false
  // Compare both even when the email is wrong, so timing doesn't reveal which.
  const emailOk = safeEqual(email.trim().toLowerCase(), adminEmail.toLowerCase())
  const passwordOk = safeEqual(password, adminPassword)
  return emailOk && passwordOk
}
