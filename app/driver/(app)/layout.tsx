import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"

import { LogoutButton } from "@/components/top-nav"
import { Toaster } from "@/components/ui/sonner"
import { driverPage } from "@/lib/server/guard"

export const metadata: Metadata = { title: "Driver · Crish Wedding Hires" }

// Driver area: a slim phone-first bar and one column of content.
// driverPage() re-checks the session and that the account is still active.
export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const driver = await driverPage()
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <Link href="/driver/dashboard" className="flex min-w-0 items-center gap-2">
            <Image src="/logo.png" alt="" width={36} height={36} priority className="size-9 rounded-lg bg-white/85" />
            <span className="truncate text-sm font-semibold">{driver.name}</span>
          </Link>
          <LogoutButton
            to="/driver/login"
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
            iconClassName="size-4"
          />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4">{children}</main>
      <Toaster theme="light" position="bottom-center" />
    </div>
  )
}
