import { ReportsView } from "@/components/bridal/reports-view"
import { adminPage } from "@/lib/server/guard"

// Monthly Booking & Inquiry Report: admins and super admins only (managers
// are sent to List Hires).
export default async function Page() {
  await adminPage()
  return <ReportsView />
}
