"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { SESSION_COOKIE } from "@/lib/auth"
import { startSuperAdminSetup, verifyRecovery, verifySignIn } from "@/lib/server/admins"
import { ipKey } from "@/lib/server/app-url"
import { UserError } from "@/lib/server/errors"
import { clearFailures, isLocked, pause, recordFailure } from "@/lib/server/rate-limit"
import { setSession } from "@/lib/server/session-cookie"

export type AdminLoginState = { error?: string; email?: string } | undefined

// Only allow redirects back into the admin area.
function safeNext(next: FormDataEntryValue | null) {
  if (typeof next !== "string") return "/admin/dashboard"
  // Bookmarks from before the admin area moved under /admin.
  if (/^\/dashboard(\/|\?|$)/.test(next)) next = `/admin${next}`
  return next.startsWith("/admin/dashboard") && !next.startsWith("//") ? next : "/admin/dashboard"
}

// Admins: email + the 6-digit code from Google Authenticator (or, for the
// super admin, a one-time recovery code). No passwords.
export async function adminSignIn(_prev: AdminLoginState, formData: FormData): Promise<AdminLoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 200)
  const code = String(formData.get("code") ?? "").trim().slice(0, 40)
  const recovery = formData.get("mode") === "recovery"
  if (!email || !code) return { error: recovery ? "Enter your email and a recovery code." : "Enter your email and the 6-digit code.", email }

  const keys = [`admin:${email}`, await ipKey()]
  if (isLocked(...keys)) return { error: "Too many wrong attempts. Wait 10 minutes and try again.", email }

  const admin = recovery ? await verifyRecovery(email, code) : await verifySignIn(email, code)
  if (!admin) {
    recordFailure(...keys)
    await pause()
    return {
      error: recovery
        ? "That recovery code isn't valid (each one works once)."
        : "That code didn't work. Use the newest code in Google Authenticator — each code works once.",
      email,
    }
  }
  clearFailures(`admin:${email}`)
  await setSession(admin.id, "admin")
  redirect(safeNext(formData.get("next")))
}

export type SetupStartState = { error?: string; email?: string } | undefined

// First run only: the email + password from .env.local (ADMIN_EMAIL /
// ADMIN_PASSWORD) prove who the super admin is, once. Then they set up
// Google Authenticator and the password is never used again.
export async function startFirstSetup(_prev: SetupStartState, formData: FormData): Promise<SetupStartState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 200)
  const password = String(formData.get("password") ?? "").slice(0, 200)
  const keys = [`setup:${email}`, await ipKey()]
  if (isLocked(...keys)) return { error: "Too many wrong attempts. Wait 10 minutes and try again.", email }
  let token: string
  try {
    token = await startSuperAdminSetup(email, password)
  } catch (err) {
    if (!(err instanceof UserError)) throw err
    recordFailure(...keys)
    await pause()
    return { error: err.message, email }
  }
  clearFailures(`setup:${email}`)
  redirect(`/admin/setup?token=${encodeURIComponent(token)}`)
}

// The caller then does a full page load to the login page, which also clears
// the router cache so Back can't show a signed-in page again.
export async function logout() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}
