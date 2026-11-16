import { connection } from "next/server"

import { InquiriesView } from "@/components/bridal/inquiries-view"
import { staffPage } from "@/lib/server/guard"
import { listInquiries, scopeOf } from "@/lib/server/inquiries"

// Manage Inquiries. Admins see every inquiry; a manager those for hire dates
// in their window and the ones they created. ?open=<id> opens one;
// &quote=1 also shows its quotation.
export default async function Page({ searchParams }: PageProps<"/admin/dashboard/inquiries">) {
  await connection()
  const me = await staffPage()
  const { open, quote } = await searchParams
  const inquiries = await listInquiries(scopeOf(me))
  const openId = typeof open === "string" ? open : undefined
  return <InquiriesView key={openId} inquiries={inquiries} openId={openId} showQuote={quote === "1"} />
}
