"use client"

import { usePathname } from "next/navigation"

import { NAV_ITEMS } from "@/components/top-nav"

export function PageTitle() {
  const pathname = usePathname()
  const title =
    NAV_ITEMS.find((i) => i.url === pathname)?.title ??
    (/^\/dashboard\/bookings\/[^/]+\/edit$/.test(pathname) ? "Edit booking" : "Bookings")
  return <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
}
