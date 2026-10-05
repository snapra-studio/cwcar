import { AdminMeProvider } from "@/components/bridal/admin-me"
import { DashboardShell } from "@/components/bridal/dashboard-shell"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { adminPage } from "@/lib/server/guard"

// Admin area. proxy.ts already routes by role; this re-checks on the server.
export default async function DashboardLayout({ children }: LayoutProps<"/admin/dashboard">) {
  const me = await adminPage()
  return (
    <AdminMeProvider me={{ id: me.id, email: me.email, name: me.name, role: me.role }}>
      <TooltipProvider>
        <DashboardShell>{children}</DashboardShell>
        <Toaster theme="light" position="bottom-center" />
      </TooltipProvider>
    </AdminMeProvider>
  )
}
