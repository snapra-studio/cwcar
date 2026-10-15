import { redirect } from "next/navigation"

import { DriversView } from "@/components/bridal/drivers-view"
import { adminPage } from "@/lib/server/guard"

// Driver accounts: super admins only (regular admins go back to Home).
export default async function Page() {
  const me = await adminPage()
  if (me.role !== "super_admin") redirect("/admin/dashboard")
  return <DriversView />
}
