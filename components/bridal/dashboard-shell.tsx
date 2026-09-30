"use client"

import { usePathname } from "next/navigation"
import { TriangleAlertIcon } from "lucide-react"

import { PageTitle } from "@/components/bridal/page-title"
import { ReminderBanner } from "@/components/bridal/reminder-banner"
import { TopNav } from "@/components/top-nav"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useBridal } from "@/lib/bridal/store"

// Shown instead of endless loading skeletons if the data can't be fetched.
function LoadError({ message }: { message: string }) {
  return (
    <Alert variant="destructive" className="mx-auto mt-6 max-w-xl">
      <TriangleAlertIcon />
      <AlertTitle>Couldn&apos;t load the bookings</AlertTitle>
      <AlertDescription className="grid gap-3">
        {message}
        <Button size="sm" variant="outline" className="w-fit" onClick={() => location.reload()}>
          Reload
        </Button>
      </AlertDescription>
    </Alert>
  )
}

// Home is a full-window photo with the navigation bar floating on top; every
// other page gets the solid bar, a page title and the padded content column.
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { error } = useBridal()

  if (pathname === "/dashboard") {
    return (
      <div className="relative flex min-h-svh flex-col">
        <TopNav overlay />
        {error ? <div className="px-4 pt-24">{<LoadError message={error} />}</div> : children}
      </div>
    )
  }
  return (
    <div className="flex min-h-svh flex-col">
      <TopNav />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4">
        <PageTitle />
        {error ? (
          <LoadError message={error} />
        ) : (
          <>
            <ReminderBanner />
            {children}
          </>
        )}
      </main>
    </div>
  )
}
