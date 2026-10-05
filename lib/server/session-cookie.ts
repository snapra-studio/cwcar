import "server-only"

import { cookies } from "next/headers"

import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken } from "@/lib/auth"
import type { Role } from "@/lib/bridal/types"

// Signs the visitor in (admin: their admins.id; driver: their users.id).
export async function setSession(sub: string, role: Role) {
  const store = await cookies()
  store.set(SESSION_COOKIE, createSessionToken(sub, role), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  })
}
