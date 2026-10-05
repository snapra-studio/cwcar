import { NextResponse } from "next/server"

import { SESSION_COOKIE } from "@/lib/auth"

// Clears the session cookie and goes to a login page. Used when a signed-in
// driver's account has been switched off: server pages can't delete cookies,
// and leaving it would bounce between the login page and the dashboard.
const TARGETS = new Set(["/admin/login", "/driver/login"])

export function GET(request: Request) {
  const to = new URL(request.url).searchParams.get("to") ?? "/admin/login"
  const res = NextResponse.redirect(new URL(TARGETS.has(to) ? to : "/admin/login", request.url))
  res.cookies.delete(SESSION_COOKIE)
  return res
}
