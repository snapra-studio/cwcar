"use client"

import { usePathname } from "next/navigation"

import { ACCOUNT_URL, accountTitle, useAdminMe } from "@/components/bridal/admin-me"
import { NAV_ITEMS } from "@/components/top-nav"

export function PageTitle() {
  const pathname = usePathname()
  const me = useAdminMe()
  const title =
    (pathname === ACCOUNT_URL ? accountTitle(me) : undefined) ??
    NAV_ITEMS.find((i) => i.url === pathname)?.title ??
    (/^\/admin\/dashboard\/bookings\/[^/]+\/edit$/.test(pathname) ? "Edit booking" : "Bookings")
  return <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
}
