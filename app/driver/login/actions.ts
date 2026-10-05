"use server"

import { redirect } from "next/navigation"

import { ipKey } from "@/lib/server/app-url"
import { dummyHash, verifyPassword } from "@/lib/server/password"
import { clearFailures, isLocked, pause, recordFailure } from "@/lib/server/rate-limit"
import { ensureDevDriver, findDriverForLogin } from "@/lib/server/repo"
import { loginSchema } from "@/lib/server/schemas"
import { setSession } from "@/lib/server/session-cookie"

export type LoginState = { error?: string; email?: string } | undefined

// Only allow redirects back into the driver area.
function safeNext(next: FormDataEntryValue | null) {
  return typeof next === "string" && next.startsWith("/driver/") && !next.startsWith("//") ? next : "/driver/dashboard"
}

// Drivers sign in with their email and password (admins use /admin/login).
export async function driverLogin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  await ensureDevDriver()
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") })
  const typedEmail = String(formData.get("email") ?? "")
  if (!parsed.success) return { error: "Enter your username and password.", email: typedEmail }
  const { email, password } = parsed.data
  const keys = [`driver:${email}`, await ipKey()]
  if (isLocked(...keys)) return { error: "Too many wrong attempts. Wait 10 minutes and try again.", email: typedEmail }

  const driver = await findDriverForLogin(email)
  // Always run one hash check so unknown emails take as long as known ones.
  const ok = await verifyPassword(password, driver?.passwordHash ?? (await dummyHash()))
  if (!driver || !ok) {
    recordFailure(...keys)
    await pause()
    return { error: "Wrong username or password.", email: typedEmail }
  }
  if (driver.status !== "active") {
    return { error: "This driver account is switched off. Ask the office to turn it back on.", email: typedEmail }
  }
  clearFailures(`driver:${email}`)
  await setSession(driver.id, "driver")
  redirect(safeNext(formData.get("next")))
}
