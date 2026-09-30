import Link from "next/link"

import { Button } from "@/components/ui/button"

// Shown for any hire the driver isn't assigned to (or that doesn't exist), so
// the page never confirms whether someone else's hire exists.
export default function DriverNotFound() {
  return (
    <div className="grid justify-items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Hire not found</h1>
      <p className="max-w-sm text-muted-foreground">It isn&apos;t assigned to you, or it no longer exists.</p>
      <Button asChild className="rounded-full">
        <Link href="/driver/dashboard">Back to my hires</Link>
      </Button>
    </div>
  )
}
