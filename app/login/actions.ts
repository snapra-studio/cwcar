"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { SESSION_COOKIE, SESSION_MAX_AGE, checkAdminCredentials, createSessionToken } from "@/lib/auth"
import type { Role } from "@/lib/bridal/types"
import { dummyHash, verifyPassword } from "@/lib/server/password"
import { ensureDevDriver, findDriverForLogin } from "@/lib/server/repo"
import { loginSchema } from "@/lib/server/schemas"

export type LoginState = { error?: string; email?: string } | undefined

// Only allow redirects back into the signed-in area for that role.
function safeNext(role: Role, next: FormDataEntryValue | null) {
  const home = role === "admin" ? "/dashboard" : "/driver/dashboard"
  if (typeof next !== "string") return home
  const prefix = role === "admin" ? "/dashboard" : "/driver/"
  return next.startsWith(prefix) && !next.startsWith("//") ? next : home
}

// Simple in-memory brake on password guessing: after 8 failures for an email,
// that email is locked for 10 minutes (per server process).
const failures = new Map<string, { count: number; until: number }>()
const LIMIT = 8
const LOCK_MS = 10 * 60 * 1000

function locked(email: string) {
  const f = failures.get(email)
  return !!f && f.count >= LIMIT && f.until > Date.now()
}
function recordFailure(email: string) {
  const f = failures.get(email)
  const count = f && f.until > Date.now() ? f.count + 1 : 1
  failures.set(email, { count, until: Date.now() + LOCK_MS })
}

// Works for both the admin and drivers; each lands in their own area.
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  await ensureDevDriver()
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") })
  const typedEmail = String(formData.get("email") ?? "")
  if (!parsed.success) return { error: "Enter your username and password.", email: typedEmail }
  const { email, password } = parsed.data

  if (locked(email)) {
    return { error: "Too many wrong attempts. Wait 10 minutes and try again.", email: typedEmail }
  }

  let session: { sub: string; role: Role } | null = null
  if (checkAdminCredentials(email, password)) {
    session = { sub: "admin", role: "admin" }
  } else {
    const driver = findDriverForLogin(email)
    // Always run one hash check so unknown emails take as long as known ones.
    const ok = await verifyPassword(password, driver?.passwordHash ?? (await dummyHash()))
    if (driver && ok) {
      if (driver.status !== "active") {
        return { error: "This driver account is switched off. Ask the office to turn it back on.", email: typedEmail }
      }
      session = { sub: driver.id, role: "driver" }
    }
  }

  if (!session) {
    recordFailure(email)
    await new Promise((r) => setTimeout(r, 500))
    return { error: "Wrong username or password.", email: typedEmail }
  }

  failures.delete(email)
  const store = await cookies()
  store.set(SESSION_COOKIE, createSessionToken(session.sub, session.role), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  })
  redirect(safeNext(session.role, formData.get("next")))
}

// The caller then does a full page load to the login page, which also clears
// the router cache so Back can't show a signed-in page again.
export async function logout() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}
