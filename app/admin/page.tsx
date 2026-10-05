import { redirect } from "next/navigation"

// /admin: the dashboard (proxy.ts sends signed-out visitors to /admin/login).
export default function AdminHome() {
  redirect("/admin/dashboard")
}
