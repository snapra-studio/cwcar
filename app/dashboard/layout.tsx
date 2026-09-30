import { DashboardShell } from "@/components/bridal/dashboard-shell"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { adminPage } from "@/lib/server/guard"

// Admin area. proxy.ts already routes by role; this re-checks on the server.
export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  await adminPage()
  return (
    <TooltipProvider>
      <DashboardShell>{children}</DashboardShell>
      <Toaster theme="light" position="bottom-center" />
    </TooltipProvider>
  )
}
