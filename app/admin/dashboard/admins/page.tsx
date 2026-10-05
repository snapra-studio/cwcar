import { connection } from "next/server"

import { AdminsView } from "@/components/bridal/admins-view"
import { listAdmins } from "@/lib/server/admins"
import { adminPage } from "@/lib/server/guard"
import { mailConfigured } from "@/lib/server/mailer"

// Super admin: manage admins. Everyone: their own sign-in (new phone).
export default async function Page() {
  await connection()
  const me = await adminPage()
  const admins = me.role === "super_admin" ? await listAdmins() : [me]
  return <AdminsView me={me} admins={admins} mailReady={mailConfigured()} />
}
