import { redirect } from "next/navigation"

import { CustomersView } from "@/components/bridal/customers-view"
import { adminPage } from "@/lib/server/guard"

// Customer list: super admins only (regular admins go back to Home).
export default async function Page() {
  const me = await adminPage()
  if (me.role !== "super_admin") redirect("/admin/dashboard")
  return <CustomersView />
}
