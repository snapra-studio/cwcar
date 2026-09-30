import { redirect } from "next/navigation"

// /driver on its own goes to the dashboard (proxy.ts sends signed-out visitors to /driver/login).
export default function DriverIndex() {
  redirect("/driver/dashboard")
}
