"use client"

import { usePathname } from "next/navigation"

import { ACCOUNT_URL, accountTitle, useAdminMe } from "@/components/bridal/admin-me"
import { NAV_ITEMS, navItemsFor } from "@/components/top-nav"

export function PageTitle() {
  const pathname = usePathname()
  const me = useAdminMe()
  const title =
    (pathname === ACCOUNT_URL ? accountTitle(me) : undefined) ??
    (me?.role === "manager" ? navItemsFor(me) : NAV_ITEMS).find((i) => i.url === pathname)?.title ??
    (/^\/admin\/dashboard\/bookings\/[^/]+\/edit$/.test(pathname)
      ? "Edit booking"
      : /^\/admin\/dashboard\/inquiries\/[^/]+\/edit$/.test(pathname)
        ? "Edit inquiry"
        : "Bookings")
  return <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
}
