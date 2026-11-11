import { connection } from "next/server"

import { PartnersAdmin } from "@/components/bridal/partners-admin"
import { adminPage } from "@/lib/server/guard"
import {
  commissionSummary,
  getCommissionSettings,
  listCommissionHistory,
  listInquiries,
  listOverrides,
  listPartnerRates,
} from "@/lib/server/partners"

// Partner Inquiries: B2B inquiries from the public /inquiry page (approve /
// reject) and partner vehicle prices — any admin. Commission settings — super admin only
// (the data isn't even loaded for other admins).
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await connection()
  const me = await adminPage()
  const { tab } = await searchParams
  const isSuper = me.role === "super_admin"
  const [inquiries, rates] = await Promise.all([listInquiries(), listPartnerRates()])
  const commission = isSuper
    ? await Promise.all([getCommissionSettings(), listOverrides(), listCommissionHistory(), commissionSummary()]).then(
        ([settings, overrides, history, summary]) => ({ settings, overrides, history, summary })
      )
    : null
  return <PartnersAdmin tab={tab} inquiries={inquiries} rates={rates} commission={commission} />
}
