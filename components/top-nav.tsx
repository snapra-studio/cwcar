"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  CalendarDaysIcon,
  CarFrontIcon,
  HouseIcon,
  IdCardIcon,
  ListIcon,
  LogOutIcon,
  MenuIcon,
  PlusIcon,
  ShieldCheckIcon,
  UsersIcon,
  WalletIcon,
  XIcon,
} from "lucide-react"

import { logout } from "@/app/admin/login/actions"
import { ACCOUNT_URL, accountTitle, useAdminMe } from "@/components/bridal/admin-me"
import { useBridal } from "@/lib/bridal/store"
import { cn } from "@/lib/utils"

export const NAV_ITEMS = [
  { title: "Home", url: "/admin/dashboard", icon: HouseIcon, description: "" },
  {
    title: "Availability",
    url: "/admin/dashboard/availability",
    icon: CalendarDaysIcon,
    description: "Calendar of free and booked cars",
  },
  {
    title: "New booking",
    url: "/admin/dashboard/bookings/new",
    icon: PlusIcon,
    description: "Book one or more cars and make the invoice",
  },
  { title: "History", url: "/admin/dashboard/history", icon: ListIcon, description: "Past and upcoming hires, Excel export" },
  {
    title: "Income & Expenses",
    url: "/admin/dashboard/finance",
    icon: WalletIcon,
    description: "Petrol, extra charges and profit per hire",
  },
  { title: "Cars", url: "/admin/dashboard/cars", icon: CarFrontIcon, description: "Our fleet and partner vehicles" },
  { title: "Drivers", url: "/admin/dashboard/drivers", icon: IdCardIcon, description: "Driver logins and assignments" },
  { title: "Customers", url: "/admin/dashboard/customers", icon: UsersIcon, description: "Everyone you have hired to" },
]

const isActiveLink = (pathname: string, url: string) =>
  url === "/admin/dashboard" ? pathname === url : pathname === url || pathname.startsWith(`${url}/`)

// Top navigation bar. `overlay` makes it see-through for sitting on top of the
// full-window photo on Home; elsewhere it is a solid sticky bar.
export function TopNav({ overlay = false }: { overlay?: boolean }) {
  const pathname = usePathname()
  const { settings } = useBridal()
  const me = useAdminMe()
  const [open, setOpen] = React.useState(false)
  const accountActive = pathname === ACCOUNT_URL

  // Close the phone menu whenever the page changes.
  const [lastPath, setLastPath] = React.useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setOpen(false)
  }

  return (
    <header
      className={cn(
        "top-0 z-30 w-full",
        overlay
          ? "absolute bg-gradient-to-b from-black/55 to-transparent text-white"
          : "sticky border-b bg-background/90 backdrop-blur-md"
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
        <Link href="/admin/dashboard" className="flex min-w-0 items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="Chrish Wedding Hires"
            width={40}
            height={40}
            priority
            className="size-10 shrink-0 rounded-lg bg-white/85"
          />
          <span className="hidden truncate text-sm font-semibold sm:block xl:hidden 2xl:block">{settings.bizName}</span>
        </Link>

        <nav aria-label="Main" className="ml-auto hidden items-center gap-0.5 xl:flex">
          {NAV_ITEMS.map((item) => {
            const active = isActiveLink(pathname, item.url)
            return (
              <Link
                key={item.url}
                href={item.url}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-2 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : overlay
                      ? "text-white/90 hover:bg-white/15 hover:text-white"
                      : "text-foreground/80 hover:bg-primary/10 hover:text-foreground"
                )}
              >
                <item.icon className="size-4" />
                {item.title}
              </Link>
            )
          })}
          {me && (
            <Link
              href={ACCOUNT_URL}
              title={`${accountTitle(me)} · ${me.email}`}
              aria-label={accountTitle(me)}
              aria-current={accountActive ? "page" : undefined}
              className={cn(
                "ml-1 grid size-9 place-items-center rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                accountActive
                  ? "bg-primary text-primary-foreground"
                  : overlay
                    ? "text-white/90 hover:bg-white/15 hover:text-white"
                    : "text-foreground/80 hover:bg-primary/10 hover:text-foreground"
              )}
            >
              <ShieldCheckIcon className="size-4" />
            </Link>
          )}
          <LogoutButton
            className={cn(
              "ml-1 inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              overlay ? "text-white/90 hover:bg-white/15 hover:text-white" : "text-foreground/70 hover:bg-destructive/10 hover:text-destructive"
            )}
            iconClassName="size-4"
          />
        </nav>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "ml-auto grid size-10 place-items-center rounded-full transition-colors xl:hidden",
            overlay ? "hover:bg-white/15" : "hover:bg-primary/10"
          )}
        >
          {open ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
        </button>
      </div>

      {open && (
        <nav
          aria-label="Main"
          className="absolute inset-x-0 top-16 animate-in border-b bg-background text-foreground shadow-lg duration-200 fade-in slide-in-from-top-2 xl:hidden"
        >
          <ul className="mx-auto grid max-w-7xl gap-1 p-3 sm:grid-cols-2">
            {NAV_ITEMS.map((item) => {
              const active = isActiveLink(pathname, item.url)
              return (
                <li key={item.url}>
                  <Link
                    href={item.url}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-3 font-medium transition-colors",
                      active ? "bg-primary text-primary-foreground" : "hover:bg-primary/10"
                    )}
                  >
                    <item.icon className="size-5" />
                    {item.title}
                  </Link>
                </li>
              )
            })}
            {me && (
              <li>
                <Link
                  href={ACCOUNT_URL}
                  aria-current={accountActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-3 font-medium transition-colors",
                    accountActive ? "bg-primary text-primary-foreground" : "hover:bg-primary/10"
                  )}
                >
                  <ShieldCheckIcon className="size-5" />
                  {accountTitle(me)}
                </Link>
              </li>
            )}
            <li>
              <LogoutButton
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 font-medium text-destructive transition-colors hover:bg-destructive/10"
                iconClassName="size-5"
              />
            </li>
          </ul>
        </nav>
      )}
    </header>
  )
}

export function LogoutButton({
  className,
  iconClassName,
  to = "/admin/login",
}: {
  className: string
  iconClassName: string
  // Login page to land on afterwards.
  to?: string
}) {
  const [pending, setPending] = React.useState(false)
  return (
    <button
      type="button"
      title="Log out"
      disabled={pending}
      className={className}
      onClick={async () => {
        setPending(true)
        await logout()
        // Full page load (not client navigation) so no signed-in page stays cached.
        window.location.replace(to)
      }}
    >
      <LogOutIcon className={iconClassName} />
      {pending ? "Logging out…" : "Log out"}
    </button>
  )
}
