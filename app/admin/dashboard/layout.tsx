import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { AdminMeProvider } from "@/components/bridal/admin-me"
import { DashboardShell } from "@/components/bridal/dashboard-shell"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { MANAGER_HOME, managerMayOpen } from "@/lib/bridal/manager"
import { staffPage } from "@/lib/server/guard"

// Admin area. proxy.ts already routes by role; this re-checks on the server.
// A manager may only open their own pages (lib/bridal/manager.ts); anything
// else, typed in or bookmarked, goes to List Hires. Each page also checks
// (a layout isn't re-run when moving between pages).
export default async function DashboardLayout({ children }: LayoutProps<"/admin/dashboard">) {
  const me = await staffPage()
  if (me.role === "manager" && !managerMayOpen((await headers()).get("x-pathname") ?? "")) redirect(MANAGER_HOME)
  return (
    <AdminMeProvider me={{ id: me.id, email: me.email, name: me.name, role: me.role }}>
      <TooltipProvider>
        <DashboardShell>{children}</DashboardShell>
        <Toaster theme="light" position="bottom-center" />
      </TooltipProvider>
    </AdminMeProvider>
  )
}
