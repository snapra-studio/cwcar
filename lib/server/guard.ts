import "server-only"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { SESSION_COOKIE, readSession, type Session } from "@/lib/auth"
import type { Driver } from "@/lib/bridal/types"
import { getDriver } from "@/lib/server/repo"

// Reusable authorization for server pages, server actions and route handlers.
// Every protected operation calls one of these first; hiding buttons in the UI
// is never the only protection.

export class Forbidden extends Error {
  constructor() {
    super("You don't have permission to do that.")
  }
}

export async function currentSession(): Promise<Session | null> {
  return readSession((await cookies()).get(SESSION_COOKIE)?.value)
}

// The signed-in driver, re-checked against the database on every request so
// a deactivated account loses access straight away.
async function activeDriver(session: Session | null): Promise<Driver | null> {
  if (session?.role !== "driver") return null
  const d = await getDriver(session.sub)
  return d && d.status === "active" ? d : null
}

// ---- For actions and API routes: throw, the caller turns it into an error. ----

export async function requireAdmin(): Promise<void> {
  const s = await currentSession()
  if (s?.role !== "admin") throw new Forbidden()
}

export async function requireDriver(): Promise<Driver> {
  const d = await activeDriver(await currentSession())
  if (!d) throw new Forbidden()
  return d
}

// ---- For server pages/layouts: redirect to the right login instead. ----

export async function adminPage(): Promise<void> {
  const s = await currentSession()
  if (s?.role === "driver") redirect("/driver/dashboard")
  if (s?.role !== "admin") redirect("/login")
}

export async function driverPage(): Promise<Driver> {
  const s = await currentSession()
  if (s?.role === "admin") redirect("/dashboard")
  const d = await activeDriver(s)
  // A driver cookie for a switched-off or deleted account: clear it on the way
  // out, or the login page would send them straight back here.
  if (!d) redirect(s?.role === "driver" ? "/api/auth/signout?to=/driver/login" : "/driver/login")
  return d
}
