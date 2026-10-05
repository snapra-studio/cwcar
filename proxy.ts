import { NextResponse, type NextRequest } from "next/server"

import { SESSION_COOKIE, readSession } from "@/lib/auth"

// First line of defence: send each visitor to the area their role allows.
//   /                      public home page (customers), not matched here
//   /admin, /admin/*       admin only
//   /driver/* (not login)  drivers only
//   /admin/login, /driver/login  signed-out visitors (signed-in users go to their area)
//   /admin/setup           anyone with a valid setup link (checked by the page)
// This check only reads the signed cookie. Server pages, actions and API
// routes check again with the database (lib/server/guard.ts).
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const session = readSession(request.cookies.get(SESSION_COOKIE)?.value)
  const home = session?.role === "admin" ? "/admin/dashboard" : session?.role === "driver" ? "/driver/dashboard" : null
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url))

  if (pathname === "/admin/setup") {
    const res = NextResponse.next()
    res.headers.set("Cache-Control", "no-store, max-age=0")
    res.headers.set("Referrer-Policy", "no-referrer")
    return res
  }

  if (pathname === "/admin/login" || pathname === "/driver/login") {
    return home ? to(home) : NextResponse.next()
  }

  const wants = pathname.startsWith("/driver") ? "driver" : "admin"
  if (session?.role !== wants) {
    if (home) return to(home)
    const url = new URL(wants === "driver" ? "/driver/login" : "/admin/login", request.url)
    if (pathname !== "/admin" && pathname !== "/driver") url.searchParams.set("next", pathname + search)
    return NextResponse.redirect(url)
  }

  // Signed-in pages must not be kept by the browser, so after logging out the
  // Back button asks the server again (and gets sent to the login page).
  const res = NextResponse.next()
  res.headers.set("Cache-Control", "no-store, max-age=0")
  return res
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/driver/:path*"],
}
